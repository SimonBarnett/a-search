'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('MRB #106 hostile: FR-034/035 ASCII titles', () => {
  it('FR-034/035 titles use ASCII to; no Unicode arrow', () => {
    const t34 = fs.readFileSync(path.join(__dirname, '..', 'docs', 'fr', 'FR-034.md'), 'utf8');
    const t35 = fs.readFileSync(path.join(__dirname, '..', 'docs', 'fr', 'FR-035.md'), 'utf8');
    assert.match(t34.split(/\r?\n/)[0], /^# FR-034: Resolve queueEnv to live\/sandbox queue URL$/);
    assert.match(t35.split(/\r?\n/)[0], /^# FR-035: CDK API Gateway POST \/search to entry$/);
    assert.doesNotMatch(t34, /\u2192/);
    assert.doesNotMatch(t35, /\u2192/);
    // classic UTF-8 arrow misread as Windows-1252 then stored as UTF-8
    assert.doesNotMatch(t34 + t35, /\u00e2\u0086\u0092/);
  });
});