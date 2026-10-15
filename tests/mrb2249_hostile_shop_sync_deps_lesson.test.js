'use strict';

/**
 * docs/mrb-2249: pin harvest-agent-skills shop-sync Lambda consumer lesson
 * (product fix #2248 / FR-2139).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillPath = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('MRB-2249 harvest lesson shop-sync Lambda deps', () => {
  it('SKILL.md contiguous handler(event, context, deps) + shop_sync_deps_unconfigured', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'UTF-8 no BOM');
    const text = buf.toString('utf8');
    assert.match(
      text,
      /handler\(event, context, deps\) like schedule\.js/,
    );
    assert.match(text, /never treat AWS context as deps/);
    assert.match(text, /shop_sync_deps_unconfigured/);
    assert.doesNotMatch(text, /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});