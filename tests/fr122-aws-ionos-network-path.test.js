'use strict';

/** FR-122: AWS -> IONOS SQL network path decision surface in docs/environments.md */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

/** RFC1918 private IPv4 — must not appear as invented firewall rules in git docs. */
const PRIVATE_IPV4 =
  /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b/;

describe('FR-122 docs/environments.md network path decision surface', () => {
  it('documents allowed options + ops checklist + least-privilege cross-link', () => {
    const text = fs.readFileSync(
      path.join(root, 'docs', 'environments.md'),
      'utf8',
    );
    assert.match(text, /## Network path \(FR-122\)/);
    assert.match(text, /WIN-MPRE8VI4U6U/);
    assert.match(text, /fixed egress/i);
    assert.match(text, /allowlist/i);
    assert.match(text, /\bVPN\b/);
    assert.match(text, /on-box only/i);
    assert.match(text, /Ops checklist/i);
    assert.match(text, /Least-privilege/i);
    assert.match(text, /SELECT/);
    assert.match(text, /never[\s\S]{0,80}firewall[\s\S]{0,80}git/i);
    // Choice may stay PENDING; surface itself is documented (not a bare one-liner).
    assert.match(text, /Chosen option[\s\S]{0,120}(PENDING|UNKNOWN|LOCKED)/i);
  });

  it('environments.md network surface has no private IPs or password assignments', () => {
    const text = fs.readFileSync(
      path.join(root, 'docs', 'environments.md'),
      'utf8',
    );
    const start = text.search(/## Network path \(FR-122\)/);
    assert.ok(start >= 0, 'missing FR-122 Network path heading');
    const rest = text.slice(start);
    const next = rest.search(/\n## /);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    assert.doesNotMatch(section, PRIVATE_IPV4);
    assert.doesNotMatch(section, /MSSQL_PASSWORD\s*=\s*\S+/);
    assert.doesNotMatch(section, /password\s*[:=]\s*['"][^'"]+['"]/i);
  });

  it('rclone-results.md cross-links the network path section', () => {
    const text = fs.readFileSync(
      path.join(root, 'docs', 'rclone-results.md'),
      'utf8',
    );
    assert.match(text, /environments\.md/);
    assert.match(text, /Network path|FR-122/i);
  });

  it('endpoint-selftest.md points at environments network path for MSSQL reachability', () => {
    const text = fs.readFileSync(
      path.join(root, 'docs', 'endpoint-selftest.md'),
      'utf8',
    );
    assert.match(text, /environments\.md/);
    assert.match(text, /mssql_unreachable|Network path|FR-122/i);
  });
});
