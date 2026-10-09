'use strict';

/**
 * MRB #960 hostile pins for FR-122 AWS->IONOS SQL network path decision surface.
 * Additive to tests/fr122-aws-ionos-network-path.test.js (product).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

const PRIVATE_IPV4 =
  /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b/;

describe('MRB-960 FR-122 hostile', () => {
  it('environments.md: A/B/C options table + Chosen option PENDING + ops checklist', () => {
    const text = fs.readFileSync(path.join(root, 'docs', 'environments.md'), 'utf8');
    assert.match(text, /## Network path \(FR-122\)/);
    assert.match(text, /\|\s*A\s*\|\s*Fixed egress allowlist/i);
    assert.match(text, /\|\s*B\s*\|\s*VPN\b/);
    assert.match(text, /\|\s*C\s*\|\s*On-box only/i);
    assert.match(text, /Chosen option[\s:*]*PENDING/);
    assert.match(text, /\*\*Ops checklist\*\*/);
    assert.match(text, /Pick exactly one of A \/ B \/ C/);
    assert.match(text, /Least-privilege login/);
    assert.match(text, /never[\s\S]{0,100}firewall[\s\S]{0,80}git/i);
  });

  it('vision.md UNKNOWN notes FR-122 decision surface LOCKED with choice PENDING', () => {
    const text = fs.readFileSync(path.join(root, 'docs', 'vision.md'), 'utf8');
    assert.match(text, /FR-122/);
    assert.match(text, /decision surface LOCKED/i);
    assert.match(text, /PENDING/);
    assert.match(text, /environments\.md/);
  });

  it('product fr122 pin file exists and forbids private IPs in Network path section', () => {
    const pin = fs.readFileSync(
      path.join(root, 'tests', 'fr122-aws-ionos-network-path.test.js'),
      'utf8',
    );
    assert.match(pin, /PRIVATE_IPV4|private IPv4/i);
    // Source pin uses a regex literal with escaped parens: /## Network path \(FR-122\)/
    assert.match(pin, /Network path \\\(FR-122\\\)/);

    const text = fs.readFileSync(path.join(root, 'docs', 'environments.md'), 'utf8');
    const start = text.search(/## Network path \(FR-122\)/);
    assert.ok(start >= 0);
    const rest = text.slice(start);
    const next = rest.search(/\n## /);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    assert.doesNotMatch(section, PRIVATE_IPV4);
  });
});
