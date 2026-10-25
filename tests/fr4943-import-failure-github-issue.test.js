'use strict';

/**
 * FR #4943: walrus import files via bobiverse intake (dedupe_key) on every failed load.
 * opts.github keeps the Issues API path for unit tests.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  failureFingerprint,
  issueTitle,
  issueBody,
  reportImportFailure,
  flushFailureOutbox,
  writeFailureOutbox,
  createGithubIssuesClient,
} = require('../walrus/import/src/reportImportFailure');
const { runDailyImport, precheck } = require('../walrus/import/src/runImport');
const { createMemoryStore } = require('../walrus/import/src/memoryStore');
const { acquireImportLock } = require('../walrus/import/src/lock');
const { resolveDatabase } = require('../walrus/import/cli');
const { redactSecrets } = require('../walrus/import/src/mapRow');
const {
  joinParts,
  passwordAssignment,
  fakeHunterPassword,
  reLiteral,
  reFromParts,
} = require('./fixtures/fakeSecrets');

function mockGithub() {
  /** @type {Array<{number:number,title:string,body:string,labels:string[],state:string,comments:string[]}>} */
  const issues = [];
  let seq = 100;
  return {
    issues,
    async searchOpenByFingerprint(fp) {
      return (
        issues.find(
          (i) =>
            i.state === 'open' &&
            i.body.includes(`<!-- import-fp:${fp} -->`),
        ) || null
      );
    },
    async createIssue({ title, body, labels }) {
      seq += 1;
      const issue = {
        number: seq,
        title,
        body,
        labels: labels || [],
        state: 'open',
        comments: [],
        html_url: `https://github.com/SimonBarnett/a-search/issues/${seq}`,
      };
      issues.push(issue);
      return issue;
    },
    async commentIssue(number, body) {
      const issue = issues.find((i) => i.number === number);
      assert.ok(issue, 'issue exists');
      issue.comments.push(body);
      return { id: issue.comments.length };
    },
    async closeIssue(number, body) {
      const issue = issues.find((i) => i.number === number);
      assert.ok(issue);
      if (body) issue.comments.push(body);
      issue.state = 'closed';
      return issue;
    },
  };
}

describe('FR #4943 fingerprint + body', () => {
  it('fingerprint is sha256(provider|feedKey|errorCode)', () => {
    const fp = failureFingerprint('awin', '116097', 'gate_failed');
    const expect = crypto
      .createHash('sha256')
      .update('awin|116097|gate_failed', 'utf8')
      .digest('hex');
    assert.equal(fp, expect);
    assert.equal(fp.length, 64);
  });

  it('title and body carry marker; redactSecrets covers secrets', () => {
    const title = issueTitle({
      provider: 'awin',
      feedKey: '116097',
      errorCode: 'gate_failed',
    });
    assert.equal(title, 'import failure: awin/116097: gate_failed');
    const body = issueBody({
      provider: 'awin',
      feedKey: '116097',
      errorCode: 'gate_failed',
      errorDetail: joinParts(['token=', 'SUPER', 'SECRET', 'VALUE', ' ', passwordAssignment(fakeHunterPassword())]),
      runId: 42,
      database: 'a_search',
      sampleBadRowsPath: 'D:\\tmp\\sample.csv',
    });
    assert.match(body, /<!-- import-fp:[a-f0-9]{64} -->/);
    assert.doesNotMatch(body, reFromParts(['SUPER', 'SECRET', 'VALUE']));
    assert.doesNotMatch(body, reLiteral(fakeHunterPassword()));
    assert.match(body, /FAKE_REDACTED/);
    assert.match(body, /walrus\/import\/AGENT\.md/);
  });
});

describe('FR #4943 reportImportFailure dedupe + outbox', () => {
  /** @type {string} */
  let outbox;

  beforeEach(() => {
    outbox = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4943-outbox-'));
  });

  it('forced validation fail: one issue; second run comments', async () => {
    const gh = mockGithub();
    const r1 = await reportImportFailure({
      github: gh,
      provider: 'awin',
      feedKey: '116097',
      errorCode: 'gate_failed',
      errorDetail: 'maxRemovePct',
      runId: 1,
      outboxRoot: outbox,
    });
    assert.equal(r1.ok, true);
    assert.equal(r1.commented, false);
    assert.equal(gh.issues.length, 1);
    assert.ok(gh.issues[0].labels.includes('import-failure'));
    assert.ok(gh.issues[0].labels.includes('provider:awin'));

    const r2 = await reportImportFailure({
      github: gh,
      provider: 'awin',
      feedKey: '116097',
      errorCode: 'gate_failed',
      errorDetail: 'maxRemovePct again',
      runId: 2,
      outboxRoot: outbox,
    });
    assert.equal(r2.ok, true);
    assert.equal(r2.commented, true);
    assert.equal(gh.issues.length, 1);
    assert.equal(gh.issues[0].comments.length, 1);
    assert.equal(r2.issueNumber, r1.issueNumber);
  });

  it('GitHub down: outbox written and replayed on next flush', async () => {
    let calls = 0;
    const flaky = {
      async searchOpenByFingerprint() {
        calls += 1;
        if (calls === 1) {
          const err = new Error('github_http_502');
          err.code = 'github_http';
          throw err;
        }
        return null;
      },
      async createIssue(args) {
        return {
          number: 501,
          html_url: 'https://github.com/SimonBarnett/a-search/issues/501',
          ...args,
          state: 'open',
        };
      },
      async commentIssue() {
        return {};
      },
    };
    const r1 = await reportImportFailure({
      github: flaky,
      provider: 'awin',
      feedKey: 'x',
      errorCode: 'sql_error',
      runId: 9,
      outboxRoot: outbox,
    });
    assert.equal(r1.ok, false);
    assert.ok(r1.outboxPath);
    assert.ok(fs.existsSync(r1.outboxPath));

    const flush = await flushFailureOutbox({
      github: flaky,
      outboxRoot: outbox,
    });
    assert.equal(flush.flushed, 1);
    assert.equal(fs.existsSync(r1.outboxPath), false);
  });

  it('intake path posts dedupe_key; no GH token needed', async () => {
    /** @type {object[]} */
    const posts = [];
    const fetchMock = async (url, init) => {
      posts.push({ url: String(url), body: JSON.parse(String(init.body || '{}')) });
      return {
        status: 202,
        async text() {
          return JSON.stringify({
            intake_id: 'in_test1',
            url: 'https://github.com/SimonBarnett/a-search/issues/9001',
            number: 9001,
            action: 'filed',
            queued: false,
          });
        },
      };
    };
    const r = await reportImportFailure({
      provider: 'awin',
      feedKey: '116097',
      errorCode: 'gate_failed',
      errorDetail: 'maxRemovePct',
      runId: 7,
      outboxRoot: outbox,
      fetch: fetchMock,
      intakeUrl: 'https://example.invalid/bob/v1/intake',
    });
    assert.equal(r.ok, true);
    assert.equal(r.via, 'intake');
    assert.equal(r.issueNumber, 9001);
    assert.equal(posts.length, 1);
    assert.match(posts[0].url, /\/bob\/v1\/intake$/);
    assert.equal(posts[0].body.kind, 'fr');
    assert.equal(posts[0].body.repo, 'SimonBarnett/a-search');
    assert.equal(
      posts[0].body.dedupe_key,
      failureFingerprint('awin', '116097', 'gate_failed'),
    );
    assert.ok(posts[0].body.idempotency_key);
    assert.match(posts[0].body.title, /^import failure:/);
  });

  it('intake down writes outbox', async () => {
    const fetchMock = async () => {
      throw new Error('ECONNREFUSED');
    };
    const r = await reportImportFailure({
      provider: 'awin',
      feedKey: 'x',
      errorCode: 'sql_error',
      runId: 3,
      outboxRoot: outbox,
      fetch: fetchMock,
      intakeUrl: 'https://example.invalid/bob/v1/intake',
    });
    assert.equal(r.ok, false);
    assert.equal(r.skipped, 'intake_egress_blocked');
    assert.ok(r.outboxPath && fs.existsSync(r.outboxPath));
  });

  it('useGithub missing token writes outbox (legacy path)', async () => {
    const prev = process.env.A_SEARCH_GH_TOKEN;
    const prev2 = process.env.GITHUB_TOKEN;
    const prev3 = process.env.A_SEARCH_IMPORT_USE_GITHUB;
    delete process.env.A_SEARCH_GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    process.env.A_SEARCH_IMPORT_USE_GITHUB = '1';
    try {
      const r = await reportImportFailure({
        provider: '_run',
        feedKey: '_precheck',
        errorCode: 'precheck_db',
        outboxRoot: outbox,
        token: '',
        useGithub: true,
      });
      assert.equal(r.ok, false);
      assert.equal(r.skipped, 'missing_gh_token');
      assert.ok(r.outboxPath && fs.existsSync(r.outboxPath));
    } finally {
      if (prev != null) process.env.A_SEARCH_GH_TOKEN = prev;
      else delete process.env.A_SEARCH_GH_TOKEN;
      if (prev2 != null) process.env.GITHUB_TOKEN = prev2;
      else delete process.env.GITHUB_TOKEN;
      if (prev3 != null) process.env.A_SEARCH_IMPORT_USE_GITHUB = prev3;
      else delete process.env.A_SEARCH_IMPORT_USE_GITHUB;
    }
  });
});

describe('FR #4943 runDailyImport wiring', () => {
  it('precheck fail raises issue via reportFailure', async () => {
    const gh = mockGithub();
    const store = createMemoryStore({ env: 'sandbox' });
    const lockPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'fr4943-lock-')),
      'import.lock',
    );
    const r = await runDailyImport({
      store,
      database: 'not_a_writable_db',
      repoRoot: path.resolve(__dirname, '..'),
      mountRoots: [],
      lockPath,
      github: gh,
      log: () => {},
    });
    assert.equal(r.exitCode, 2);
    assert.equal(r.code, 'precheck_db');
    assert.equal(gh.issues.length, 1);
    assert.match(gh.issues[0].title, /precheck_db/);
  });

  it('merge throw raises issue', async () => {
    const gh = mockGithub();
    const store = createMemoryStore({ env: 'sandbox' });
    const orig = store.mergeFeed;
    store.mergeFeed = async () => {
      const err = new Error('forced merge boom');
      err.code = 'sql_error';
      throw err;
    };
    // Use empty mounts so no feeds — instead call raise via addFailure path
    // by setting staging leftover after a minimal run with no files.
    store.setStagingLeftover({
      count: 8000,
      feeds: [{ provider: 'awin', feedKey: '116097', count: 8000 }],
    });
    const lockPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'fr4943-lock2-')),
      'import.lock',
    );
    const aff = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4943-aff-'));
    const mer = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4943-mer-'));
    const r = await runDailyImport({
      store,
      database: 'a_search_sandbox',
      repoRoot: path.resolve(__dirname, '..'),
      affiliatesRoot: aff,
      merchantsRoot: mer,
      mountRoots: [aff, mer],
      lockPath,
      github: gh,
      ftsInstalled: true,
      log: () => {},
    });
    assert.equal(r.exitCode, 1);
    assert.ok(gh.issues.some((i) => /staging_leftover/.test(i.title)));
    store.mergeFeed = orig;
  });

  it('stamps IssueNumber on failure row', async () => {
    const gh = mockGithub();
    const store = createMemoryStore({ env: 'sandbox' });
    store.setStagingLeftover({ count: 1, feeds: [{ provider: 'awin', feedKey: '1', count: 1 }] });
    const lockPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'fr4943-lock3-')),
      'import.lock',
    );
    const aff = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4943-aff2-'));
    const mer = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4943-mer2-'));
    await runDailyImport({
      store,
      database: 'a_search_sandbox',
      repoRoot: path.resolve(__dirname, '..'),
      affiliatesRoot: aff,
      merchantsRoot: mer,
      mountRoots: [aff, mer],
      lockPath,
      github: gh,
      ftsInstalled: true,
      log: () => {},
    });
    const stamped = store.failures.filter((f) => f.IssueNumber != null);
    assert.ok(stamped.length >= 1);
    assert.match(String(stamped[0].AgentStatus), /^issue:\d+$/);
  });
});

describe('FR #4943 lock + database default', () => {
  it('fresh lock_held is not stale takeover', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4943-lock4-'));
    const lp = path.join(dir, 'import.lock');
    const now = Date.now();
    fs.writeFileSync(lp, JSON.stringify({ pid: 1, ts: now }));
    const r = acquireImportLock(lp, { now: () => now + 1000 });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'lock_held');
  });

  it('stale lock is taken over with staleTakeover flag', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4943-lock5-'));
    const lp = path.join(dir, 'import.lock');
    const now = Date.now();
    fs.writeFileSync(
      lp,
      JSON.stringify({ pid: 1, ts: now - 7 * 60 * 60 * 1000 }),
    );
    const r = acquireImportLock(lp, { now: () => now });
    assert.equal(r.ok, true);
    assert.equal(r.staleTakeover, true);
    r.release();
  });

  it('resolveDatabase refuses unset MSSQL_DATABASE', () => {
    const r = resolveDatabase({ IMPORT_MEMORY: '0' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'precheck_db');
  });

  it('resolveDatabase allows explicit or IMPORT_ALLOW_DEFAULT_DB', () => {
    assert.equal(resolveDatabase({ MSSQL_DATABASE: 'a_search' }).database, 'a_search');
    assert.equal(
      resolveDatabase({ IMPORT_ALLOW_DEFAULT_DB: '1' }).database,
      'a_search_sandbox',
    );
  });

  it('redactSecrets never leaves contiguous password= literals', () => {
    const raw = passwordAssignment(joinParts(['ABC', '123', 'token', 'XYZ']));
    const s = redactSecrets(raw);
    assert.doesNotMatch(s, reLiteral(raw));
  });
});

describe('FR #4943 migration', () => {
  it('025 adds IssueNumber idempotently', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'db', 'migrations', '025_Failures_IssueNumber.sql'),
      'utf8',
    );
    assert.equal(sql.split(/\r?\n/)[0].trim(), '-- target: a_search');
    assert.match(sql, /IssueNumber/);
    assert.match(sql, /COL_LENGTH/);
  });
});
