'use strict';

/**
 * FR-163: docs/destroy-rollback.md + README/deploy pointers.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assertAscii(text, label) {
  assert.ok(
    !/[^\x09\x0A\x0D\x20-\x7E]/.test(text),
    `${label} must be ASCII`,
  );
}

describe('FR-163 destroy / rollback playbook', () => {
  it('docs/destroy-rollback.md covers destroy, retain, bucket RETAIN, order', () => {
    const p = path.join(root, 'docs', 'destroy-rollback.md');
    assert.ok(fs.existsSync(p), 'docs/destroy-rollback.md required');
    const text = read('docs/destroy-rollback.md');
    assertAscii(text, 'destroy-rollback.md');

    assert.match(text, /cdk destroy/i);
    assert.match(text, /RemovalPolicy\.RETAIN|removalPolicy[^\n]*RETAIN/i);
    assert.match(text, /autoDeleteObjects:\s*false|autoDeleteObjects/i);
    assert.match(text, /SQS|queue/i);
    assert.match(text, /DLQ|dead.?letter/i);
    assert.match(text, /S3|bucket|S3_RESULTS_BUCKET|ResultsBucket/i);
    assert.match(text, /MSSQL|SQL/i);
    assert.match(text, /Secrets Manager|secret/i);
    assert.match(text, /rclone/i);
    assert.match(text, /order of operations|Order of operations/i);
    assert.match(text, /rollback|redeploy/i);
    assert.match(text, /deploy\.md/);
    assert.match(text, /smoke|FR-144/i);
    assert.match(text, /FR-163/);
    assert.match(text, /[Oo]ut of scope/);
    assert.match(text, /CI/);
    // no embedded secrets / JWTs
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}/);
    assert.doesNotMatch(text, /AKIA[0-9A-Z]{16}/);
  });

  it('README + deploy.md point at destroy-rollback.md', () => {
    const readme = read('README.md');
    assert.match(readme, /docs\/destroy-rollback\.md/);

    const deploy = read('docs/deploy.md');
    assert.match(deploy, /destroy-rollback\.md/);
    assert.match(deploy, /FR-163/);
  });

  it('FR-163 Decision LOCKED + release-gap Yes', () => {
    const fr = read('docs/fr/FR-163.md');
    assert.match(fr, /Decision\s*\(?\s*LOCKED\)?/i);
    assert.match(fr, /fr163-destroy-rollback-docs\.test\.js/);
    assert.match(fr, /RemovalPolicy\.RETAIN|RETAIN/);
    assertAscii(fr, 'FR-163.md');

    const gap = read('docs/release-gap-pass2-2026-10-09.md');
    assert.match(
      gap,
      /Destroy\/rollback docs[^\n]*FR-163[^\n]*\*\*Yes\*\*/i,
    );
  });
});
