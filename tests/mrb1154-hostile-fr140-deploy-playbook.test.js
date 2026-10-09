/**
 * MRB #1154 hostile pins for FR-140 docs/deploy.md installable playbook.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel));

test('mrb1154: deploy.md ASCII playbook steps + SearchApiUrl + out-of-scope FR-141/144', () => {
  const raw = read('docs/deploy.md');
  assert.ok(raw[0] !== 0xef, 'deploy.md must be UTF-8 without BOM');
  for (const b of raw) {
    assert.ok(b < 128, 'deploy.md must stay ASCII');
  }
  const text = raw.toString('utf8');
  assert.match(text, /## 2\. AWS auth/);
  assert.match(text, /## 3\. CDK bootstrap/);
  assert.match(text, /## 4\. Fill secrets/);
  assert.match(text, /FR-136/);
  assert.match(text, /FR-137/);
  assert.match(text, /FR-138/);
  assert.match(text, /## 5\. cdk deploy/);
  assert.match(text, /SearchApiUrl/);
  assert.match(text, /FR-144/);
  assert.match(text, /FR-141/);
  assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(text, /AKIA[0-9A-Z]{16}/);
});

test('mrb1154: FR-140 Decision LOCKED + product pin + release-gap Yes', () => {
  const fr = read('docs/fr/FR-140.md').toString('utf8');
  assert.match(fr, /Decision \(LOCKED\)|Decision.*LOCKED/i);
  assert.ok(fs.existsSync(path.join(ROOT, 'tests/fr140-deploy-playbook.test.js')));
  const gap = read('docs/release-gap-aws-installable-2026-10-09.md').toString('utf8');
  assert.match(
    gap,
    /docs\/deploy\.md[^\n]*\*\*Yes\*\*[^\n]*FR-140|install playbook[^\n]*\*\*Yes\*\*[^\n]*FR-140/i
  );
  const readme = read('README.md').toString('utf8');
  assert.match(readme, /docs\/deploy\.md/);
});
