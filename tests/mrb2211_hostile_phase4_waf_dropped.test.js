'use strict';

/**
 * MRB #2211 hostile pins: Phase-4 index annotates WAF as DROPPED (#1033 / #1381).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'docs', 'phase4-enablement-index.md');
const FR166 = path.join(ROOT, 'tests', 'fr166-phase4-enablement-index.test.js');

describe('MRB #2211 hostile Phase-4 WAF DROPPED', () => {
  it('index marks WAF DROPPED with #1033 not planned; do not schedule FR-186..189', () => {
    const buf = fs.readFileSync(INDEX);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.match(text, /WAF[\s\S]{0,200}DROPPED/i);
    assert.match(text, /#1033/);
    assert.match(text, /not planned/i);
    assert.match(text, /do not schedule FR-186/i);
    assert.match(text, /FR-186\.\.189/);
  });

  it('fr166 pin requires DROPPED annotation (not bare WAF as planned wave)', () => {
    const text = fs.readFileSync(FR166, 'utf8');
    assert.match(text, /DROPPED|#1033[\s\S]{0,80}not planned/i);
    assert.doesNotMatch(
      text,
      /assert\.match\(text,\s*\/FR-186\|WAF\/\)/,
    );
  });
});
