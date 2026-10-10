'use strict';

/**
 * MRB #1272 hostile: FR-153 corsOrigins allowlist; reject *; Decision LOCKED.
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

describe('MRB-1272 FR-153 CORS allowlist hostile', () => {
  it('resolveCorsOrigins default localhost; empty deny; reject wildcard', () => {
    const {
      resolveCorsOrigins,
      DEFAULT_SYNTH_ORIGINS,
    } = require('../cdk/lib/resolve-cors-origins');
    assert.deepEqual(DEFAULT_SYNTH_ORIGINS, ['http://localhost:3000']);
    assert.deepEqual(resolveCorsOrigins({}), ['http://localhost:3000']);
    assert.deepEqual(resolveCorsOrigins({ corsOrigins: '' }), []);
    assert.deepEqual(
      resolveCorsOrigins({ corsOrigins: 'https://a.example, https://b.example' }),
      ['https://a.example', 'https://b.example'],
    );
    assert.throws(
      () => resolveCorsOrigins({ corsOrigins: '*' }),
      (err) => err && err.code === 'A_SEARCH_CORS_WILDCARD',
    );
    assert.throws(
      () => resolveCorsOrigins({ corsOrigins: 'https://ok.example,*' }),
      (err) => err && err.code === 'A_SEARCH_CORS_WILDCARD',
    );
  });

  it('stack wires corsPreflight; FR-153 LOCKED; gap Yes; docs/mrb cites', () => {
    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /FR-153/);
    assert.match(stack, /resolveCorsOrigins|corsPreflight/);
    assert.match(stack, /corsOrigins/);
    const resolveSrc = assertUtf8NoBomAscii(
      path.join(root, 'cdk', 'lib', 'resolve-cors-origins.js'),
      'resolve-cors-origins.js',
    );
    assert.doesNotMatch(resolveSrc, /[^\x09\x0A\x0D\x20-\x7E]/);
    const fr = assertUtf8NoBomAscii(
      path.join(root, 'docs', 'fr', 'FR-153.md'),
      'docs/fr/FR-153.md',
    );
    assert.match(fr, /Decision\s+LOCKED/i);
    assert.match(fr, /corsOrigins/);
    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /No API CORS[\s\S]{0,80}\*\*Yes\*\*|FR-153[\s\S]{0,40}\*\*Yes\*\*/i);
    const deploy = fs.readFileSync(path.join(root, 'docs', 'deploy.md'), 'utf8');
    assert.match(deploy, /corsOrigins|CORS/i);
    const mrb = assertUtf8NoBomAscii(
      path.join(root, 'docs', 'mrb', 'mrb-1272.md'),
      'docs/mrb/mrb-1272.md',
    );
    assert.match(mrb, /#1272|#996|FR-153/);
  });
});
