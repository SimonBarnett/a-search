'use strict';

/** FR-053a: docs/endpoint-performance.md + a-search-endpoint skill pointer */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const doc = path.join(root, 'docs', 'endpoint-performance.md');
const skill = path.join(
  root,
  '.grok',
  'skills',
  'a-search-endpoint',
  'SKILL.md',
);

describe('FR-053a docs/endpoint-performance.md', () => {
  it('doc lists clicks, visits, sales, JWT userId, env', () => {
    assert.ok(fs.existsSync(doc), 'missing docs/endpoint-performance.md');
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(text, /clicks/i);
    assert.match(text, /visits/i);
    assert.match(text, /sales/i);
    assert.match(text, /userId/);
    assert.match(text, /JWT|Bearer/i);
    assert.match(text, /live|sandbox/);
    assert.match(text, /\/account\/performance/);
  });

  it('a-search-endpoint skill points at endpoint-performance.md', () => {
    assert.ok(fs.existsSync(skill), 'missing a-search-endpoint SKILL.md');
    const text = fs.readFileSync(skill, 'utf8');
    assert.match(text, /docs\/endpoint-performance\.md/);
    assert.match(text, /clicks/i);
    assert.match(text, /sales/i);
    assert.match(text, /userId/);
  });

  it('root README links the performance doc', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/endpoint-performance\.md/);
  });
});
