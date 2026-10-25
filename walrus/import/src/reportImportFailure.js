'use strict';

/**
 * FR #4943: deterministic GitHub issue on SimonBarnett/a-search for every
 * failed walrus import. No LLM. Fingerprint dedupe + local outbox when GH down.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { redactSecrets } = require('./mapRow');

const DEFAULT_REPO = 'SimonBarnett/a-search';
const FP_MARKER_RE = /<!--\s*import-fp:([a-f0-9]{64})\s*-->/i;

/**
 * @param {string} provider
 * @param {string} feedKey
 * @param {string} errorCode
 * @returns {string} sha256 hex
 */
function failureFingerprint(provider, feedKey, errorCode) {
  const p = String(provider || '_run').trim() || '_run';
  const f = String(feedKey || '_run').trim() || '_run';
  const c = String(errorCode || 'unknown').trim() || 'unknown';
  const payload = `${p}|${f}|${c}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * @param {{ provider?: string, feedKey?: string, errorCode?: string }} opts
 */
function issueTitle(opts) {
  const provider = String(opts.provider || '_run').trim() || '_run';
  const feedKey = String(opts.feedKey || '_run').trim() || '_run';
  const code = String(opts.errorCode || 'unknown').trim() || 'unknown';
  return `import failure: ${provider}/${feedKey}: ${code}`;
}

/**
 * @param {object} opts
 */
function issueBody(opts) {
  const fp = opts.fingerprint || failureFingerprint(opts.provider, opts.feedKey, opts.errorCode);
  const detail = redactSecrets(String(opts.errorDetail || ''));
  const lines = [
    `<!-- import-fp:${fp} -->`,
    '',
    '## Import failure (deterministic)',
    '',
    `- **RunId:** ${opts.runId != null ? opts.runId : '(none)'}`,
    `- **Host:** ${redactSecrets(String(opts.host || os.hostname() || ''))}`,
    `- **Database:** ${redactSecrets(String(opts.database || ''))}`,
    `- **Provider / feed:** \`${opts.provider || '_run'}/${opts.feedKey || '_run'}\``,
    `- **ErrorCode:** \`${opts.errorCode || 'unknown'}\``,
    `- **FileKey / version:** \`${opts.fileKey || ''}\` / \`${opts.version || ''}\``,
    `- **Rows read / staged / rejected:** ${opts.rowsRead != null ? opts.rowsRead : 'n/a'} / ${opts.rowsStaged != null ? opts.rowsStaged : 'n/a'} / ${opts.rowsRejected != null ? opts.rowsRejected : 'n/a'}`,
    `- **SampleBadRowsPath:** \`${redactSecrets(String(opts.sampleBadRowsPath || ''))}\``,
    `- **provider.json SHA:** \`${opts.providerJsonSha || ''}\``,
    '',
    '### Detail',
    '',
    '```',
    detail.slice(0, 1800),
    '```',
    '',
    'Review playbook: `walrus/import/AGENT.md`',
  ];
  return lines.join('\n');
}

/**
 * @param {string} [root]
 */
function defaultOutboxRoot(root) {
  if (root) return root;
  if (process.env.A_SEARCH_IMPORT_FAILURE_OUTBOX) {
    return String(process.env.A_SEARCH_IMPORT_FAILURE_OUTBOX).trim();
  }
  return path.join(process.cwd(), 'import-failures');
}

/**
 * @param {object} opts
 * @returns {string} path written
 */
function writeFailureOutbox(opts) {
  const root = defaultOutboxRoot(opts.outboxRoot);
  const runId = opts.runId != null ? String(opts.runId) : 'no-run';
  const dir = path.join(root, runId);
  fs.mkdirSync(dir, { recursive: true });
  const fp = opts.fingerprint || failureFingerprint(opts.provider, opts.feedKey, opts.errorCode);
  const file = path.join(dir, `issue-${fp.slice(0, 16)}.json`);
  const payload = {
    fingerprint: fp,
    title: issueTitle(opts),
    body: issueBody({ ...opts, fingerprint: fp }),
    provider: opts.provider || '_run',
    feedKey: opts.feedKey || '_run',
    errorCode: opts.errorCode || 'unknown',
    labels: ['import-failure', `provider:${String(opts.provider || '_run').toLowerCase()}`],
    runId: opts.runId != null ? opts.runId : null,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return file;
}

/**
 * Minimal GitHub Issues API (injectable fetch). Token never logged.
 * @param {{ token: string, repo?: string, fetch?: Function }} opts
 */
function createGithubIssuesClient(opts) {
  const token = String((opts && opts.token) || '').trim();
  const repo = String((opts && opts.repo) || DEFAULT_REPO).trim() || DEFAULT_REPO;
  const fetchFn =
    typeof (opts && opts.fetch) === 'function'
      ? opts.fetch
      : typeof fetch === 'function'
        ? fetch.bind(globalThis)
        : null;
  if (!token) {
    const err = new Error('missing_gh_token');
    err.code = 'missing_gh_token';
    throw err;
  }
  if (!fetchFn) {
    const err = new Error('fetch_unavailable');
    err.code = 'fetch_unavailable';
    throw err;
  }
  const [owner, name] = repo.split('/');
  const base = `https://api.github.com/repos/${owner}/${name}`;

  async function api(method, urlPath, body) {
    const res = await fetchFn(`${base}${urlPath}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'a-search-walrus-import',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(`github_http_${res.status}`);
      err.code = 'github_http';
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  }

  return {
    repo,
    async searchOpenByFingerprint(fp) {
      // List recent open import-failure issues and match marker (no search API needed).
      const issues = await api(
        'GET',
        '/issues?state=open&labels=import-failure&per_page=100',
      );
      const list = Array.isArray(issues) ? issues : [];
      for (const issue of list) {
        const body = String((issue && issue.body) || '');
        const m = body.match(FP_MARKER_RE);
        if (m && m[1] === fp) return issue;
      }
      return null;
    },
    async createIssue({ title, body, labels }) {
      return api('POST', '/issues', { title, body, labels });
    },
    async commentIssue(number, body) {
      return api('POST', `/issues/${Number(number)}/comments`, { body });
    },
    async closeIssue(number, body) {
      if (body) await api('POST', `/issues/${Number(number)}/comments`, { body });
      return api('PATCH', `/issues/${Number(number)}`, { state: 'closed' });
    },
  };
}

/**
 * Create or comment on the fingerprint issue; outbox on failure.
 * @param {object} opts
 * @returns {Promise<{ ok: boolean, issueNumber?: number, issueUrl?: string, outboxPath?: string, commented?: boolean, skipped?: string }>}
 */
async function reportImportFailure(opts) {
  const provider = String((opts && opts.provider) || '_run').trim() || '_run';
  const feedKey = String((opts && opts.feedKey) || '_run').trim() || '_run';
  const errorCode = String((opts && opts.errorCode) || 'unknown').trim() || 'unknown';
  const fp = failureFingerprint(provider, feedKey, errorCode);
  const title = issueTitle({ provider, feedKey, errorCode });
  const body = issueBody({ ...opts, provider, feedKey, errorCode, fingerprint: fp });
  const labels = [
    'import-failure',
    `provider:${provider.toLowerCase()}`,
  ];

  const token =
    (opts && opts.token) ||
    process.env.A_SEARCH_GH_TOKEN ||
    process.env.GITHUB_TOKEN ||
    '';
  let client = opts.github || null;
  if (!client) {
    if (!String(token).trim()) {
      const outboxPath = writeFailureOutbox({
        ...opts,
        provider,
        feedKey,
        errorCode,
        fingerprint: fp,
      });
      return { ok: false, outboxPath, skipped: 'missing_gh_token' };
    }
    try {
      client = createGithubIssuesClient({
        token: String(token).trim(),
        repo: opts.repo || DEFAULT_REPO,
        fetch: opts.fetch,
      });
    } catch (err) {
      const outboxPath = writeFailureOutbox({
        ...opts,
        provider,
        feedKey,
        errorCode,
        fingerprint: fp,
      });
      return {
        ok: false,
        outboxPath,
        skipped: (err && err.code) || 'github_client',
      };
    }
  }

  try {
    const existing = await client.searchOpenByFingerprint(fp);
    if (existing && existing.number) {
      const comment = [
        `Re-occurred on run ${opts.runId != null ? opts.runId : '(none)'}`,
        '',
        body,
      ].join('\n');
      await client.commentIssue(existing.number, comment);
      return {
        ok: true,
        commented: true,
        issueNumber: existing.number,
        issueUrl: existing.html_url || existing.url,
        fingerprint: fp,
      };
    }
    const created = await client.createIssue({ title, body, labels });
    return {
      ok: true,
      commented: false,
      issueNumber: created.number,
      issueUrl: created.html_url || created.url,
      fingerprint: fp,
    };
  } catch (err) {
    const outboxPath = writeFailureOutbox({
      ...opts,
      provider,
      feedKey,
      errorCode,
      fingerprint: fp,
    });
    return {
      ok: false,
      outboxPath,
      skipped: (err && err.code) || 'github_error',
      error: redactSecrets(String((err && err.message) || err)),
    };
  }
}

/**
 * Replay outbox JSON files created while GitHub was down.
 * @param {object} opts
 */
async function flushFailureOutbox(opts) {
  const root = defaultOutboxRoot(opts && opts.outboxRoot);
  if (!fs.existsSync(root)) return { flushed: 0, failed: 0 };
  const results = [];
  const runDirs = fs.readdirSync(root);
  for (const runDir of runDirs) {
    const abs = path.join(root, runDir);
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    for (const name of fs.readdirSync(abs)) {
      if (!/^issue-.*\.json$/i.test(name)) continue;
      const file = path.join(abs, name);
      let payload;
      try {
        payload = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        continue;
      }
      const r = await reportImportFailure({
        ...opts,
        ...payload,
        provider: payload.provider,
        feedKey: payload.feedKey,
        errorCode: payload.errorCode,
        runId: payload.runId,
        errorDetail: payload.body,
        outboxRoot: root,
      });
      if (r.ok) {
        try {
          fs.unlinkSync(file);
        } catch {
          // keep
        }
      }
      results.push({ file, ...r });
    }
  }
  return {
    flushed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

/**
 * Optional auto-close when the same fingerprint next succeeds.
 */
async function maybeCloseFailureIssue(opts) {
  const fp = failureFingerprint(opts.provider, opts.feedKey, opts.errorCode);
  const token =
    (opts && opts.token) ||
    process.env.A_SEARCH_GH_TOKEN ||
    process.env.GITHUB_TOKEN ||
    '';
  let client = opts.github || null;
  if (!client) {
    if (!String(token).trim()) return { ok: false, skipped: 'missing_gh_token' };
    client = createGithubIssuesClient({
      token: String(token).trim(),
      repo: opts.repo || DEFAULT_REPO,
      fetch: opts.fetch,
    });
  }
  const existing = await client.searchOpenByFingerprint(fp);
  if (!existing || !existing.number) return { ok: true, closed: false };
  await client.closeIssue(
    existing.number,
    `Closed automatically: fingerprint cleared on run ${opts.runId != null ? opts.runId : '(none)'} (import OK).`,
  );
  return { ok: true, closed: true, issueNumber: existing.number };
}

module.exports = {
  failureFingerprint,
  issueTitle,
  issueBody,
  writeFailureOutbox,
  createGithubIssuesClient,
  reportImportFailure,
  flushFailureOutbox,
  maybeCloseFailureIssue,
  defaultOutboxRoot,
  DEFAULT_REPO,
  FP_MARKER_RE,
};
