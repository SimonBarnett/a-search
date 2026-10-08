'use strict';

/** FR-059a: docs/endpoint-selftest.md + a-search-endpoint skill pointer */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const doc = path.join(root, 'docs', 'endpoint-selftest.md');
const skill = path.join(
  root,
  '.grok',
  'skills',
  'a-search-endpoint',
  'SKILL.md',
);

describe('FR-059a docs/endpoint-selftest.md', () => {
  it('doc lists auth, env, providers status, intake on fail', () => {
    assert.ok(fs.existsSync(doc), 'missing docs/endpoint-selftest.md');
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(text, /\/selftest/);
    assert.match(text, /GET|POST/);
    assert.match(text, /JWT|Bearer/i);
    assert.match(text, /userId/);
    assert.match(text, /live|sandbox/);
    assert.match(text, /providers/i);
    assert.match(text, /intake/i);
    assert.match(text, /SimonBarnett\/a-search/);
    assert.match(text, /irc\.ntsa\.uk\/bob\/v1\/intake|intake webhook/i);
  });

  it('a-search-endpoint skill points at endpoint-selftest.md', () => {
    assert.ok(fs.existsSync(skill), 'missing a-search-endpoint SKILL.md');
    const text = fs.readFileSync(skill, 'utf8');
    assert.match(text, /docs\/endpoint-selftest\.md/);
    assert.match(text, /selftest/i);
    assert.match(text, /intake/i);
    assert.match(text, /providers/i);
  });

  it('root README links the selftest doc', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/endpoint-selftest\.md/);
  });
});
