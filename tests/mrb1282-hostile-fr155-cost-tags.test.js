'use strict';

/**
 * MRB #1282 hostile: FR-155 cost tags Project=a-search + Env from stage.
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

describe('MRB-1282 FR-155 cost tags hostile', () => {
  it('resolveCostTags Project fixed; Env from stage/env/costEnv; default', () => {
    const {
      resolveCostTags,
      PROJECT_TAG,
      DEFAULT_ENV_TAG,
    } = require('../cdk/lib/resolve-cost-tags');
    assert.equal(PROJECT_TAG, 'a-search');
    assert.equal(DEFAULT_ENV_TAG, 'default');
    assert.deepEqual(resolveCostTags({}), { Project: 'a-search', Env: 'default' });
    assert.deepEqual(resolveCostTags({ stage: 'prod' }), {
      Project: 'a-search',
      Env: 'prod',
    });
    assert.deepEqual(resolveCostTags({ env: 'staging' }), {
      Project: 'a-search',
      Env: 'staging',
    });
    assert.deepEqual(resolveCostTags({ stage: '', env: 'x' }), {
      Project: 'a-search',
      Env: 'default',
    });
    assert.deepEqual(resolveCostTags({ costEnv: 'ci' }), {
      Project: 'a-search',
      Env: 'ci',
    });
  });

  it('stack Tags.of + FR-155 LOCKED + gap Yes + deploy note', () => {
    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /FR-155/);
    assert.match(stack, /resolveCostTags/);
    assert.match(stack, /Tags\.of\(this\)\.add\(['\"]Project['\"]/);
    assert.match(stack, /Tags\.of\(this\)\.add\(['\"]Env['\"]/);
    assert.match(stack, /resolveCorsOrigins/);
    const fr = assertUtf8NoBomAscii(
      path.join(root, 'docs', 'fr', 'FR-155.md'),
      'docs/fr/FR-155.md',
    );
    assert.match(fr, /Decision\s+LOCKED/i);
    assert.match(fr, /Project=a-search|resolve-cost-tags/);
    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /Cost tags[\s\S]{0,80}\*\*Yes\*\*/i);
    const deploy = fs.readFileSync(path.join(root, 'docs', 'deploy.md'), 'utf8');
    assert.match(deploy, /Cost tags \(FR-155\)|FR-155/);
    assert.match(deploy, /CORS allowlist \(FR-153\)|corsOrigins/);
    const mrb = assertUtf8NoBomAscii(
      path.join(root, 'docs', 'mrb', 'mrb-1282.md'),
      'docs/mrb/mrb-1282.md',
    );
    assert.match(mrb, /#1282|#998|FR-155/);
  });
});
