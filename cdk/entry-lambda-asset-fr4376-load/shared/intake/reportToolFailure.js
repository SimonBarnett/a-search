'use strict';

/**
 * FR #5151: generic CLI tool failure -> bobiverse intake (or GitHub / outbox).
 * Fingerprint: sha256(tool|errorCode|normalizedFirstLine).
 * Reuses intake URL resolution from reportException; secrets via shared/intake/redact.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { redactSecrets } = require('./redact');
const {
  resolveIntakeUrl,
  DEFAULT_INTAKE_URL,
} = require('./reportException');

const DEFAULT_REPO = 'SimonBarnett/a-search';
const FP_MARKER_RE = /<!--\s*tool-fp:([a-f0-9]{64})\s*-->/i;

function normalizeFirstLine(detail) {
  const s = String(detail || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0) || '';
  return s
    .replace(/\s+/g, ' ')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<guid>')
    .slice(0, 240)
    .toLowerCase();
}

function toolFailureFingerprint(opts) {
  const tool = String((opts && opts.tool) || 'tool').trim() || 'tool';
  const errorCode = String((opts && opts.errorCode) || 'error').trim() || 'error';
  const first = normalizeFirstLine((opts && (opts.errorDetail || opts.detail)) || '');
  return crypto
    .createHash('sha256')
    .update(`${tool}|${errorCode}|${first}`, 'utf8')
    .digest('hex');
}

function issueTitle(opts) {
  const tool = String((opts && opts.tool) || 'tool').trim() || 'tool';
  const code = String((opts && opts.errorCode) || 'error').trim() || 'error';
  const first = normalizeFirstLine((opts && (opts.errorDetail || opts.detail)) || '').slice(0, 80);
  return `tool failure: ${tool}: ${code}${first ? ' --- ' + first : ''}`.slice(0, 200);
}

function issueBody(opts) {
  const fp = opts.fingerprint || toolFailureFingerprint(opts);
  const detail = redactSecrets(String(opts.errorDetail || opts.detail || ''));
  const lines = [
    `<!-- tool-fp:${fp} -->`,
    '',
    '## Tool failure (deterministic, FR #5151)',
    '',
    `- **Tool:** \`${opts.tool || 'tool'}\``,
    `- **ErrorCode:** \`${opts.errorCode || 'error'}\``,
    `- **ExitCode:** ${opts.exitCode != null ? opts.exitCode : 'n/a'}`,
    `- **Machine:** ${redactSecrets(String(opts.machine || os.hostname() || ''))}`,
    `- **VERSION:** \`${opts.version || ''}\``,
    `- **Git:** \`${opts.gitCommit || ''}\``,
    `- **Cwd:** \`${redactSecrets(String(opts.cwd || ''))}\``,
    `- **S3:** \`${redactSecrets(String(opts.s3Uri || ''))}\``,
    `- **Command:** \`${redactSecrets(String(opts.commandLine || ''))}\``,
    `- **AWS identity ARN:** \`${redactSecrets(String(opts.awsIdentityArn || ''))}\``,
    '',
    '### Detail',
    '',
    '```',
    detail.slice(0, 1800),
    '```',
  ];
  return lines.join('\n');
}

function isDataMountPath(p) {
  const s = String(p || '').replace(/\\/g, '/').toLowerCase();
  if (!s) return false;
  // Never write failure outbox into club/affiliate data mounts (FR #5164).
  return (
    /(^|\/)a-clubs(\/|$)/.test(s) ||
    /(^|\/)a-affiliates(\/|$)/.test(s)
  );
}

function defaultOutboxRoot(root) {
  const tmp = path.join(require('os').tmpdir(), 'a-search-tool-failures');
  const pick = (candidate) => {
    const c = String(candidate || '').trim();
    if (!c) return null;
    if (isDataMountPath(c)) return null;
    return c;
  };
  const fromArg = pick(root);
  if (fromArg) return fromArg;
  const fromEnv = pick(process.env.A_SEARCH_TOOL_FAILURE_OUTBOX);
  if (fromEnv) return fromEnv;
  const fromImport = pick(process.env.A_SEARCH_IMPORT_FAILURE_OUTBOX);
  if (fromImport) return fromImport;
  // Prefer <repo>/logs/tool-failures (__dirname = shared/intake).
  const repoLogs = path.join(path.resolve(__dirname, '..', '..'), 'logs', 'tool-failures');
  if (!isDataMountPath(repoLogs)) {
    return repoLogs;
  }
  const cwd = process.cwd();
  if (isDataMountPath(cwd)) {
    return tmp;
  }
  return path.join(cwd, 'tool-failures');
}

function writeFailureOutbox(opts) {
  const root = defaultOutboxRoot(opts.outboxRoot);
  const runId = opts.runId != null ? String(opts.runId) : 'no-run';
  const dir = path.join(root, runId);
  fs.mkdirSync(dir, { recursive: true });
  const fp = opts.fingerprint || toolFailureFingerprint(opts);
  const file = path.join(dir, `issue-${fp.slice(0, 16)}.json`);
  const tool = String(opts.tool || 'tool').toLowerCase();
  const payload = {
    fingerprint: fp,
    title: issueTitle({ ...opts, fingerprint: fp }),
    body: issueBody({ ...opts, fingerprint: fp }),
    tool: opts.tool || 'tool',
    errorCode: opts.errorCode || 'error',
    labels: ['tool-failure', `tool:${tool}`],
    runId: opts.runId != null ? opts.runId : null,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return file;
}

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
        'User-Agent': 'a-search-tool-failure',
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
      const issues = await api(
        'GET',
        '/issues?state=open&labels=tool-failure&per_page=100',
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
  };
}

function buildToolIntakePayload(opts, fp, title, body) {
  const runId = opts.runId != null ? String(opts.runId) : '';
  const idem = crypto
    .createHash('sha256')
    .update(`${fp}|${runId}`, 'utf8')
    .digest('hex');
  return {
    kind: 'fr',
    repo: String(opts.repo || DEFAULT_REPO),
    title: String(title || '').slice(0, 200),
    body,
    dedupe_key: fp,
    idempotency_key: idem,
    source: {
      machine: String(
        opts.machine || process.env.COMPUTERNAME || 'tool',
      ).slice(0, 64),
      agent: `a-search-${String(opts.tool || 'tool')}`,
      version: String(opts.version || process.env.A_SEARCH_VERSION || '').slice(
        0,
        32,
      ),
    },
  };
}

function parseIntakeResponse(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function intakeNumberFrom(doc) {
  if (doc && doc.number != null && Number(doc.number) > 0) {
    return Number(doc.number);
  }
  const url = String((doc && doc.url) || '');
  const m = url.match(/\/issues\/(\d+)/);
  return m ? Number(m[1]) : undefined;
}

async function reportViaIntake(opts, fp, title, body) {
  const intakeUrl = resolveIntakeUrl(opts);
  const fetchFn =
    typeof (opts && opts.fetch) === 'function'
      ? opts.fetch
      : typeof fetch === 'function'
        ? fetch.bind(globalThis)
        : null;
  if (!fetchFn) {
    const outboxPath = writeFailureOutbox({ ...opts, fingerprint: fp });
    return {
      ok: false,
      outboxPath,
      skipped: 'fetch_unavailable',
      fingerprint: fp,
      via: 'intake',
    };
  }
  const payload = buildToolIntakePayload(opts, fp, title, body);
  try {
    const res = await fetchFn(intakeUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const status = res && typeof res.status === 'number' ? res.status : 0;
    const responseText =
      res && typeof res.text === 'function' ? await res.text() : '';
    const doc = parseIntakeResponse(responseText);
    if (status === 400 || status === 403) {
      return {
        ok: false,
        skipped: 'intake_permanent',
        status,
        fingerprint: fp,
        via: 'intake',
        error: redactSecrets(responseText).slice(0, 400),
      };
    }
    if (status === 429 || status >= 500 || status === 0) {
      const outboxPath = writeFailureOutbox({ ...opts, fingerprint: fp });
      return {
        ok: false,
        outboxPath,
        skipped: 'intake_retry',
        status,
        fingerprint: fp,
        via: 'intake',
      };
    }
    if (doc.queued === true && !doc.url) {
      const outboxPath = writeFailureOutbox({
        ...opts,
        fingerprint: fp,
        intakeId: doc.intake_id,
      });
      return {
        ok: false,
        outboxPath,
        skipped: 'intake_queued',
        intakeId: doc.intake_id,
        fingerprint: fp,
        via: 'intake',
      };
    }
    if (doc.queued === false && !doc.url) {
      return {
        ok: false,
        skipped: 'intake_test_filer',
        intakeId: doc.intake_id,
        fingerprint: fp,
        via: 'intake',
      };
    }
    const number = intakeNumberFrom(doc);
    const action = String(doc.action || 'filed');
    return {
      ok: true,
      commented: action === 'commented' || action === 'reopened',
      reopened: action === 'reopened',
      issueNumber: number,
      issueUrl: doc.url || undefined,
      intakeId: doc.intake_id,
      action,
      fingerprint: fp,
      via: 'intake',
      payload,
    };
  } catch (err) {
    // FR #5164: when intake is blocked (e.g. redqueen egress), try GitHub if client/token present.
    try {
      let client = opts && opts.github;
      const token =
        (opts && opts.token) ||
        process.env.A_SEARCH_GH_TOKEN ||
        process.env.GITHUB_TOKEN ||
        '';
      if (!client && String(token).trim()) {
        client = createGithubIssuesClient({
          token: String(token).trim(),
          repo: (opts && opts.repo) || DEFAULT_REPO,
          fetch: opts && opts.fetch,
        });
      }
      if (client) {
        const title = issueTitle({ ...opts, fingerprint: fp });
        const body = issueBody({ ...opts, fingerprint: fp });
        const tool = String((opts && opts.tool) || 'tool').toLowerCase();
        const labels = ['tool-failure', `tool:${tool}`];
        const existing = await client.searchOpenByFingerprint(fp);
        if (existing && existing.number) {
          await client.commentIssue(
            existing.number,
            [`Re-occurred (intake blocked)`, '', body].join('\n'),
          );
          return {
            ok: true,
            commented: true,
            issueNumber: existing.number,
            issueUrl: existing.html_url || existing.url,
            fingerprint: fp,
            via: 'github_fallback',
            intakeError: redactSecrets(String((err && err.message) || err)),
          };
        }
        const created = await client.createIssue({ title, body, labels });
        return {
          ok: true,
          commented: false,
          issueNumber: created.number,
          issueUrl: created.html_url || created.url,
          fingerprint: fp,
          via: 'github_fallback',
          intakeError: redactSecrets(String((err && err.message) || err)),
        };
      }
    } catch (_) {
      /* fall through to outbox */
    }
    const outboxPath = writeFailureOutbox({ ...opts, fingerprint: fp });
    return {
      ok: false,
      outboxPath,
      skipped: 'intake_egress_blocked',
      fingerprint: fp,
      via: 'intake',
      error: redactSecrets(String((err && err.message) || err)),
    };
  }
}

async function reportToolFailure(opts) {
  const tool = String((opts && opts.tool) || 'tool').trim() || 'tool';
  const errorCode = String((opts && opts.errorCode) || 'error').trim() || 'error';
  const fp = toolFailureFingerprint({ ...opts, tool, errorCode });
  const title = issueTitle({ ...opts, tool, errorCode, fingerprint: fp });
  const body = issueBody({ ...opts, tool, errorCode, fingerprint: fp });
  const labels = ['tool-failure', `tool:${tool.toLowerCase()}`];

  const forceGithub =
    Boolean(opts && opts.github) ||
    Boolean(opts && opts.useGithub) ||
    String(process.env.A_SEARCH_TOOL_USE_GITHUB || '').trim() === '1' ||
    String(process.env.A_SEARCH_IMPORT_USE_GITHUB || '').trim() === '1';
  if (!forceGithub) {
    return reportViaIntake({ ...opts, tool, errorCode }, fp, title, body);
  }

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
        tool,
        errorCode,
        fingerprint: fp,
      });
      return { ok: false, outboxPath, skipped: 'missing_gh_token', fingerprint: fp };
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
        tool,
        errorCode,
        fingerprint: fp,
      });
      return {
        ok: false,
        outboxPath,
        skipped: (err && err.code) || 'github_client',
        fingerprint: fp,
      };
    }
  }

  try {
    const existing = await client.searchOpenByFingerprint(fp);
    if (existing && existing.number) {
      const comment = [
        `Re-occurred (${tool}) exit=${opts.exitCode != null ? opts.exitCode : 'n/a'}`,
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
      tool,
      errorCode,
      fingerprint: fp,
    });
    return {
      ok: false,
      outboxPath,
      skipped: (err && err.code) || 'github_error',
      fingerprint: fp,
      error: redactSecrets(String((err && err.message) || err)),
    };
  }
}

module.exports = {
  normalizeFirstLine,
  toolFailureFingerprint,
  issueTitle,
  issueBody,
  writeFailureOutbox,
  createGithubIssuesClient,
  reportToolFailure,
  reportViaIntake,
  buildToolIntakePayload,
  defaultOutboxRoot,
  isDataMountPath,
  DEFAULT_REPO,
  DEFAULT_INTAKE_URL,
  FP_MARKER_RE,
};
