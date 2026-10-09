'use strict';

/**
 * MRB #1251 hostile: FR-150 secrets-matrix keys-only + FR-146 Recommended sandbox pin.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function assertUtf8NoBomAscii(filePath, label) {
  const buf = fs.readFileSync(filePath);
  assert.equal(
    buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
    false,
    `${label} must be UTF-8 without BOM`,
  );
  const text = buf.toString('utf8');
  assert.ok(
    !/[^\x09\x0A\x0D\x20-\x7E]/.test(text),
    `${label} must be ASCII (hostile b<128)`,
  );
  return text;
}

describe('MRB-1251 FR-150 secrets-matrix hostile', () => {
  it('matrix: entry JWT Yes; marketplace workers no MSSQL; local MSSQL; no values', () => {
    const text = assertUtf8NoBomAscii(
      path.join(root, 'docs', 'secrets-matrix.md'),
      'docs/secrets-matrix.md',
    );
    assert.match(text, /FR-150/);
    assert.match(text, /a-search-entry[\s\S]{0,80}Yes \(FR-136\)/);
    assert.match(text, /amazon,ebay,rakuten,cj[\s\S]{0,200}No[\s\S]{0,40}Yes/);
    assert.match(text, /awin,impact[\s\S]{0,120}Yes \(FR-137\)/);
    assert.match(text, /No secret values|never paste passwords/i);
    assert.doesNotMatch(text, /open FR-136/i);
    assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9\-_]{20,}/);
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./);
  });

  it('FR-150 LOCKED + README pointer + release-gap Yes', () => {
    const fr = assertUtf8NoBomAscii(
      path.join(root, 'docs', 'fr', 'FR-150.md'),
      'docs/fr/FR-150.md',
    );
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /fr150-secrets-matrix\.test\.js/);
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /secrets-matrix\.md/);
    assert.match(readme, /FR-150/);
    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-aws-installable-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /secrets-matrix\.md[\s\S]{0,80}\*\*Yes\*\*/);
  });

  it('FR-146 Recommended a_search_sandbox Treat-as-missing (suite-debt #1280)', () => {
    const env = fs.readFileSync(path.join(root, 'docs', 'environments.md'), 'utf8');
    assert.match(env, /Recommended[\s\S]{0,120}a_search_sandbox/i);
    assert.match(env, /Treat as missing|do not invent credentials/i);
    assert.doesNotMatch(env, /MSSQL_DATABASE=a_search_sandbox/);
    const fr119 = fs.readFileSync(
      path.join(root, 'tests', 'fr119-mssql-target.test.js'),
      'utf8',
    );
    assert.match(fr119, /Recommended[\s\S]{0,120}a_search_sandbox/i);
    assert.match(fr119, /Treat as missing|do not invent credentials/i);
    assert.doesNotMatch(fr119, /no\[\s\\S\]\{0,40\}a_search_sandbox/);
    const mrb921 = fs.readFileSync(
      path.join(root, 'tests', 'mrb921-fr119-hostile.test.js'),
      'utf8',
    );
    assert.match(mrb921, /Recommended[\s\S]{0,120}a_search_sandbox/i);
    assert.match(mrb921, /Treat as missing|do not invent credentials/i);
  });

  it('docs/mrb/mrb-1251.md cites product + #1280', () => {
    const text = assertUtf8NoBomAscii(
      path.join(root, 'docs', 'mrb', 'mrb-1251.md'),
      'docs/mrb/mrb-1251.md',
    );
    assert.match(text, /#1251|#986|FR-150/);
    assert.match(text, /#1280|fr119|Recommended/);
  });
});
