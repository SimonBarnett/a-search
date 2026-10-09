'use strict';

/**
 * MRB #1151 docs/hostile: FR-139 CI gate + Ubuntu green-path needles.
 * Additive pins after product #1151 merge (vision S4 / release D1).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

describe('MRB #1151 hostile FR-139 GitHub Actions CI', () => {
  it('ci.yml: ubuntu Node 20 + setup-python + npm ci/test/synth', () => {
    const yml = fs.readFileSync(
      path.join(root, '.github/workflows/ci.yml'),
      'utf8',
    );
    assert.match(yml, /ubuntu-latest/);
    assert.match(yml, /setup-node@v4/);
    assert.match(yml, /node-version:\s*['"]?20['"]?/);
    assert.match(yml, /setup-python@v5/);
    assert.match(yml, /npm ci/);
    assert.match(yml, /npm test/);
    assert.match(yml, /npm run synth/);
    assert.match(yml, /timeout-minutes:\s*180/);
  });

  it('tools/validate-vision-pack.py is vendored for FR-055 Actions pins', () => {
    const p = path.join(root, 'tools/validate-vision-pack.py');
    assert.ok(fs.existsSync(p), 'vendored validate-vision-pack.py');
    const text = fs.readFileSync(p, 'utf8');
    assert.match(text, /vision|VISION|validate/i);
  });

  it('release-gap CI row Yes and FR-139 Decision LOCKED; ASCII docs', () => {
    const gapPath = path.join(root, 'docs/release-gap-aws-installable-2026-10-09.md');
    const gapBuf = fs.readFileSync(gapPath);
    assert.equal(gapBuf[0] === 0xef && gapBuf[1] === 0xbb && gapBuf[2] === 0xbf, false);
    const gap = gapBuf.toString('utf8');
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(gap), 'release-gap ASCII');
    assert.match(gap, /\.github\/workflows` CI \|\s*\*\*Yes\*\*/);
    const fr = fs.readFileSync(path.join(root, 'docs/fr/FR-139.md'), 'utf8');
    assert.match(fr, /Decision[\s\S]{0,40}LOCKED/i);
  });

  it('run-tests.js uses --test-concurrency=1 for Ubuntu CDK races', () => {
    const runner = fs.readFileSync(
      path.join(root, 'scripts/run-tests.js'),
      'utf8',
    );
    assert.match(runner, /test-concurrency[= ]1|--test-concurrency=1/);
  });

  it('fr058b no-rateLimit example is __no_such_source__', () => {
    const src = fs.readFileSync(
      path.join(root, 'tests/fr058b-registry-rate-limit.test.js'),
      'utf8',
    );
    assert.match(src, /rateLimit\('__no_such_source__'\)/);
  });
});