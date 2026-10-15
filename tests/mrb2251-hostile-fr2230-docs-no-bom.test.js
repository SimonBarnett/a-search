'use strict';

/**
 * docs/mrb-2251 hostile pin for FR-2230 recursive docs markdown UTF-8 no BOM
 * (PR #2251 / #2230).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB-2251 FR-2230 docs recursive no-BOM hostile', () => {
  it('fr2230 gate walks docs recursively and pins EF BB BF', () => {
    const gate = fs.readFileSync(
      path.join(root, 'tests', 'fr2230-docs-no-bom.test.js'),
      'utf8',
    );
    assert.match(gate, /listMarkdownFiles/);
    assert.match(gate, /0xef/);
    assert.match(gate, /0xbb/);
    assert.match(gate, /0xbf/);
    assert.match(gate, /docsDir/);
    assert.doesNotMatch(gate, /^<<<<<<<|^=======|^>>>>>>>/m);
  });

  it('FR-2230 Decision LOCKED UTF-8 no-BOM; named survivors BOM-free', () => {
    const frPath = path.join(root, 'docs', 'fr', 'FR-2230.md');
    const buf = fs.readFileSync(frPath);
    assert.notEqual(buf[0], 0xef);
    const fr = buf.toString('utf8');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /fr2230-docs-no-bom\.test\.js/);
    assert.match(fr, /UTF8Encoding\(false\)|Path\.write_text/);
    for (const rel of [
      'endpoint-search.md',
      'mrb-106.md',
      'mrb-82.md',
      'fr/FR-2230.md',
    ]) {
      const b = fs.readFileSync(path.join(root, 'docs', rel));
      assert.ok(
        !(b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf),
        `BOM still present: docs/${rel}`,
      );
    }
  });

  it('harvest-agent-skills lesson cites FR-2230 recursive docs no-BOM', () => {
    const skill = fs.readFileSync(
      path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'),
      'utf8',
    );
    assert.match(skill, /FR-2230/);
    assert.match(skill, /no-BOM|no BOM|EF BB BF/i);
    assert.match(skill, /docs\/mrb|recursive/i);
  });
});
