'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');

describe('MRB #76 hostile: FR-024 maintainer schedules', () => {
  it('separate Lambdas fix A_SEARCH_ENV live vs sandbox; rate 15m', () => {
    const text = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(text, /a-search-maintainer-live/);
    assert.match(text, /a-search-maintainer-sandbox/);
    assert.match(text, /A_SEARCH_ENV:\s*'live'/);
    assert.match(text, /A_SEARCH_ENV:\s*'sandbox'/);
    assert.match(text, /Duration\.minutes\(15\)/);
    assert.match(text, /schedule\.handler/);
    assert.ok(
      fs.existsSync(path.join(root, 'maintainer', 'src', 'schedule.js')),
      'maintainer/src/schedule.js',
    );
  });

  it('npm run synth exits 0; template has both maintainer names', () => {
    const r = runCdkSynth(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const outDir = path.join(root, 'cdk.out');
    const templates = fs
      .readdirSync(outDir)
      .filter((f) => f.endsWith('.template.json'));
    assert.ok(templates.length >= 1);
    const tpl = fs.readFileSync(path.join(outDir, templates[0]), 'utf8');
    assert.match(tpl, /a-search-maintainer-live/);
    assert.match(tpl, /a-search-maintainer-sandbox/);
    assert.match(tpl, /rate\(15 minutes\)/);
  });
});