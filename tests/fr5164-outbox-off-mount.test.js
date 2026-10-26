const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  isDataMountPath,
  defaultOutboxRoot,
  writeFailureOutbox,
  reportViaIntake,
} = require('../shared/intake/reportToolFailure');

describe('FR #5164 outbox never under a-clubs', () => {
  it('isDataMountPath detects a-clubs and a-affiliates', () => {
    assert.equal(isDataMountPath('S:\\a-clubs\\host\\guid'), true);
    assert.equal(isDataMountPath('S:/a-clubs/host'), true);
    assert.equal(isDataMountPath('D:/s3/a-affiliates/awin'), true);
    assert.equal(isDataMountPath('C:\\ai\\a-search\\tools'), false);
    assert.equal(isDataMountPath(os.tmpdir()), false);
  });

  it('defaultOutboxRoot prefers repo logs, not cwd under a-clubs', () => {
    const prev = process.env.A_SEARCH_TOOL_FAILURE_OUTBOX;
    const prevImport = process.env.A_SEARCH_IMPORT_FAILURE_OUTBOX;
    delete process.env.A_SEARCH_TOOL_FAILURE_OUTBOX;
    delete process.env.A_SEARCH_IMPORT_FAILURE_OUTBOX;
    const prevCwd = process.cwd();
    try {
      const fakeClub = path.join(os.tmpdir(), 'fr5164-a-clubs', 'host1');
      fs.mkdirSync(fakeClub, { recursive: true });
      process.chdir(fakeClub);
      const root = defaultOutboxRoot();
      assert.ok(!isDataMountPath(root), root);
      assert.ok(
        root.includes('logs') || root.includes('a-search-tool-failures'),
        root,
      );
    } finally {
      process.chdir(prevCwd);
      if (prev === undefined) delete process.env.A_SEARCH_TOOL_FAILURE_OUTBOX;
      else process.env.A_SEARCH_TOOL_FAILURE_OUTBOX = prev;
      if (prevImport === undefined) delete process.env.A_SEARCH_IMPORT_FAILURE_OUTBOX;
      else process.env.A_SEARCH_IMPORT_FAILURE_OUTBOX = prevImport;
    }
  });

  it('writeFailureOutbox with cwd-like club path still lands off mount when outbox unset', () => {
    const prev = process.env.A_SEARCH_TOOL_FAILURE_OUTBOX;
    delete process.env.A_SEARCH_TOOL_FAILURE_OUTBOX;
    delete process.env.A_SEARCH_IMPORT_FAILURE_OUTBOX;
    const prevCwd = process.cwd();
    try {
      const fakeClub = path.join(os.tmpdir(), 'fr5164-a-clubs-write', 'guid');
      fs.mkdirSync(fakeClub, { recursive: true });
      process.chdir(fakeClub);
      const file = writeFailureOutbox({
        tool: 'meta',
        errorCode: 'head_failed',
        errorDetail: 'head_failed: s3://a-clubs/x/',
        fingerprint: 'a'.repeat(64),
      });
      assert.ok(file && fs.existsSync(file));
      assert.ok(!file.toLowerCase().includes(`${path.sep}a-clubs${path.sep}`), file);
    } finally {
      process.chdir(prevCwd);
      if (prev === undefined) delete process.env.A_SEARCH_TOOL_FAILURE_OUTBOX;
      else process.env.A_SEARCH_TOOL_FAILURE_OUTBOX = prev;
    }
  });

  it('reportViaIntake falls back to github when intake fetch throws and github client set', async () => {
    const issues = [];
    const github = {
      async searchOpenByFingerprint() {
        return null;
      },
      async createIssue({ title, body, labels }) {
        const issue = {
          number: 5164,
          title,
          body,
          labels,
          html_url: 'https://github.com/SimonBarnett/a-search/issues/5164',
        };
        issues.push(issue);
        return issue;
      },
      async commentIssue() {
        return {};
      },
    };
    const r = await reportViaIntake(
      {
        tool: 'meta',
        errorCode: 'head_failed',
        errorDetail: 'head_failed: boom',
        fetch: async () => {
          throw new Error('egress blocked');
        },
        github,
      },
      'b'.repeat(64),
      'title',
      'body',
    );
    assert.equal(r.ok, true);
    assert.equal(r.via, 'github_fallback');
    assert.equal(r.issueNumber, 5164);
    assert.equal(issues.length, 1);
  });
});
