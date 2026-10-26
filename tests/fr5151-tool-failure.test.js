'use strict';


/**
 * FR #5151: generic tool failure reporter — fingerprint, dedupe comment, outbox on fail.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  normalizeFirstLine,
  toolFailureFingerprint,
  issueTitle,
  issueBody,
  reportToolFailure,
  writeFailureOutbox,
} = require('../shared/intake/reportToolFailure');

function mockGithub() {
  const issues = [];
  let seq = 200;
  return {
    issues,
    async searchOpenByFingerprint(fp) {
      return (
        issues.find(
          (i) =>
            i.state === 'open' &&
            i.body.includes(`<!-- tool-fp:${fp} -->`),
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
      assert.ok(issue);
      issue.comments.push(body);
      return { id: issue.comments.length };
    },
  };
}

describe('FR #5151 tool failure fingerprint + body', () => {
  it('fingerprint is sha256(tool|errorCode|normalizedFirstLine)', () => {
    const detail = 'head_failed: s3://a-clubs/host/\nmore';
    const fp = toolFailureFingerprint({
      tool: 'meta',
      errorCode: 'head_failed',
      errorDetail: detail,
    });
    const first = normalizeFirstLine(detail);
    const expect = crypto
      .createHash('sha256')
      .update(`meta|head_failed|${first}`, 'utf8')
      .digest('hex');
    assert.equal(fp, expect);
    assert.equal(fp.length, 64);
  });

  it('body carries tool-fp marker and redacts secrets', () => {
    const body = issueBody({
      tool: 'search',
      errorCode: 'search_api_url_required',
      errorDetail: 'token=SUPERSECRET value',
      cwd: 'S:\\a-clubs\\x',
      s3Uri: 's3://a-clubs/x/',
      commandLine: 'search -AwsProfile p',
      awsIdentityArn: 'arn:aws:iam::123:user/x',
      exitCode: 1,
      version: '0.1.0',
    });
    assert.match(body, /<!-- tool-fp:[a-f0-9]{64} -->/);
    assert.match(body, /\*\*Tool:\*\* `search`/);
    assert.doesNotMatch(body, /SUPERSECRET/);
  });

  it('second identical failure comments instead of creating', async () => {
    const gh = mockGithub();
    const opts = {
      tool: 'meta',
      errorCode: 'head_failed',
      errorDetail: 'head_failed: s3://a-clubs/h/: 403',
      exitCode: 1,
      github: gh,
      useGithub: true,
    };
    const r1 = await reportToolFailure(opts);
    assert.equal(r1.ok, true);
    assert.equal(r1.commented, false);
    assert.equal(gh.issues.length, 1);
    const r2 = await reportToolFailure(opts);
    assert.equal(r2.ok, true);
    assert.equal(r2.commented, true);
    assert.equal(r2.issueNumber, r1.issueNumber);
    assert.equal(gh.issues.length, 1);
    assert.equal(gh.issues[0].comments.length, 1);
  });

  it('filing failure writes outbox and returns ok=false', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr5151-outbox-'));
    const r = await reportToolFailure({
      tool: 'download',
      errorCode: 'boom',
      errorDetail: 'boom: no network',
      exitCode: 1,
      useGithub: true,
      token: '',
      outboxRoot: dir,
    });
    assert.equal(r.ok, false);
    assert.ok(r.outboxPath);
    assert.ok(fs.existsSync(r.outboxPath));
  });
});
