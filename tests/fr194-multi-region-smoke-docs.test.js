'use strict';

/**
 * FR-194 / #1041: multi-region smoke + failover checklist + --region flag.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function utf8NoBom(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.notEqual(buf[0], 0xef, `${rel} must be UTF-8 without BOM`);
  const text = buf.toString('utf8');
  for (let i = 0; i < text.length; i += 1) {
    assert.ok(
      text.charCodeAt(i) < 128,
      `${rel} non-ASCII at ${i}: U+${text.charCodeAt(i).toString(16)}`,
    );
  }
  return text;
}

describe('FR-194 multi-region smoke checklist', () => {
  it('multi-region-smoke.md Decision LOCKED + checklist + --region', () => {
    const text = utf8NoBom('docs/multi-region-smoke.md');
    assert.match(text, /Decision \(LOCKED\)/);
    assert.match(text, /Checklist/);
    assert.match(text, /--region/);
    assert.match(text, /smoke-deploy\.js/);
    assert.match(text, /failover/i);
    assert.match(text, /SearchApiUrl|JWT/);
  });

  it('FR-194.md Decision LOCKED', () => {
    const fr = utf8NoBom('docs/fr/FR-194.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /multi-region-smoke\.md/);
    assert.match(fr, /--region/);
  });

  it('smoke-deploy resolveSmokeTarget --region / env URL pick', () => {
    const {
      resolveSmokeTarget,
      regionEnvSuffix,
    } = require('../scripts/smoke-deploy');
    assert.equal(regionEnvSuffix('eu-west-2'), 'EUWEST2');
    const a = resolveSmokeTarget({
      region: 'eu-west-2',
      env: {
        A_SEARCH_API_URL_EUWEST2: 'https://primary.example.test',
        A_SEARCH_API_URL: 'https://fallback.example.test',
      },
    });
    assert.equal(a.region, 'eu-west-2');
    assert.equal(a.baseUrl, 'https://primary.example.test');
    const b = resolveSmokeTarget({
      url: 'https://explicit.example.test',
      region: 'eu-west-1',
      env: { A_SEARCH_API_URL_EUWEST1: 'https://standby.example.test' },
    });
    assert.equal(b.baseUrl, 'https://explicit.example.test');
    const script = utf8NoBom('scripts/smoke-deploy.js');
    assert.match(script, /FR-194/);
    assert.match(script, /--region/);
  });
});
