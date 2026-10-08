'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');

describe('FR-024 EventBridge maintainer schedules', () => {
  it('stack has two env targets with A_SEARCH_ENV live and sandbox', () => {
    const text = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(text, /MaintainerLive/);
    assert.match(text, /MaintainerSandbox/);
    assert.match(text, /A_SEARCH_ENV:\s*'live'/);
    assert.match(text, /A_SEARCH_ENV:\s*'sandbox'/);
    assert.match(text, /aws-events/);
    assert.match(text, /Schedule\.rate/);
  });

  it('npm run synth exits 0 with schedule wiring', () => {
    const r = runCdkSynth(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    // Synthesized template should mention both maintainer rules/functions
    const outDir = path.join(root, 'cdk.out');
    const templates = fs.existsSync(outDir)
      ? fs.readdirSync(outDir).filter((f) => f.endsWith('.template.json'))
      : [];
    assert.ok(templates.length >= 1, 'expected cdk.out template');
    const tpl = fs.readFileSync(path.join(outDir, templates[0]), 'utf8');
    assert.match(tpl, /a-search-maintainer-live/);
    assert.match(tpl, /a-search-maintainer-sandbox/);
  });
});
