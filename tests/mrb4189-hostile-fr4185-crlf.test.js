'use strict';

/**
 * MRB #4189 hostile: fr055h Architecture fence must match CRLF LOCKED lines
 * (the Win autocrlf failure mode for FR #4185).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

describe('MRB #4189 hostile FR #4185 CRLF fence', () => {
  it('architectureFence accepts CRLF between Architecture and LOCKED', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'tests', 'fr055h-vision-architecture-phase1b.test.js'),
      'utf8',
    );
    assert.match(src, /\\r\?\\nLOCKED\\r\?\\n/);
    // Reproduce the fence helper against synthetic CRLF text.
    const fenceSrc = src.match(
      /function architectureFence\(text\) \{[\s\S]*?\n\}/,
    );
    assert.ok(fenceSrc, 'architectureFence present');
    const sandbox = {
      assert,
      module: { exports: {} },
      exports: {},
      require,
      console,
    };
    vm.runInNewContext(`${fenceSrc[0]}; this.architectureFence = architectureFence;`, sandbox);
    const crlf =
      '## Architecture\r\nphase1b\r\nLOCKED\r\n## Screens\r\n';
    const out = sandbox.architectureFence(crlf);
    assert.match(out, /## Architecture/);
    assert.doesNotMatch(out, /## Screens/);
  });

  it('docs/vision.md working copy still has LOCKED before Screens', () => {
    const text = fs.readFileSync(path.join(ROOT, 'docs', 'vision.md'), 'utf8');
    const start = text.indexOf('## Architecture');
    const m = /\r?\nLOCKED\r?\n/.exec(text.slice(start));
    assert.ok(m);
    assert.ok(text.indexOf('## Screens', start + m.index) > start);
  });
});
