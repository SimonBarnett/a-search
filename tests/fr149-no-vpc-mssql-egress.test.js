'use strict';

/**
 * FR-149: explicit no-VPC CDK + deploy.md fixed-egress allowlist for MSSQL (FR-122 A).
 * No invented private IPs / firewall dumps in git.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

/** RFC1918 private IPv4 - must not appear as invented allowlist rules in FR-149 docs. */
const PRIVATE_IPV4 =
  /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b/;

function assertUtf8NoBomAscii(filePath, label) {
  const buf = fs.readFileSync(filePath);
  assert.equal(
    buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
    false,
    `${label} must be UTF-8 without BOM`,
  );
  const text = buf.toString('utf8');
  assert.ok(
    !/[^\x09\x0A\x0D\x20-\x7E]/.test(text),
    `${label} must be ASCII (hostile b<128)`,
  );
  return text;
}

describe('FR-149 no-VPC MSSQL egress pattern', () => {
  it('CDK stack is explicit no-VPC (no ec2.Vpc / NAT / SG wiring)', () => {
    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /FR-149/);
    assert.match(stack, /no-?VPC|no VPC/i);
    // No aws-ec2 import or live VPC/NAT/SG constructs (doc comments may name them).
    assert.doesNotMatch(stack, /require\(['"]aws-cdk-lib\/aws-ec2['"]\)/);
    assert.doesNotMatch(stack, /\bnew\s+ec2\.Vpc\b/);
    assert.doesNotMatch(stack, /\bVpc\.fromLookup\b/);
    assert.doesNotMatch(stack, /\bnew\s+ec2\.SecurityGroup\b/);
    assert.doesNotMatch(stack, /\bNatProvider\b/);
    assert.doesNotMatch(stack, /vpc:\s*\w+/);
  });

  it('deploy.md documents no-VPC + fixed egress allowlist steps; links FR-122', () => {
    const deployPath = path.join(root, 'docs', 'deploy.md');
    const text = assertUtf8NoBomAscii(deployPath, 'docs/deploy.md');
    assert.match(text, /FR-149/);
    assert.match(text, /no-?VPC|no VPC/i);
    assert.match(text, /fixed egress|allowlist/i);
    assert.match(text, /FR-122|environments\.md/i);
    assert.match(text, /1433|SQL TCP/i);
    // Extract FR-149 section (heading containing FR-149 through next ##)
    const start = text.search(/##[^\n]*FR-149/);
    assert.ok(start >= 0, 'missing FR-149 heading in deploy.md');
    const rest = text.slice(start);
    const next = rest.search(/\n## /);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    assert.doesNotMatch(section, PRIVATE_IPV4);
    assert.doesNotMatch(section, /MSSQL_PASSWORD\s*=\s*\S+/);
  });

  it('environments.md cross-links FR-149 installable no-VPC pattern', () => {
    const text = fs.readFileSync(
      path.join(root, 'docs', 'environments.md'),
      'utf8',
    );
    assert.match(text, /## Network path \(FR-122\)/);
    assert.match(text, /FR-149/);
    assert.match(text, /no-?VPC|no VPC/i);
  });

  it('FR-149 Decision LOCKED + release-gap VPC/egress Yes; ASCII FR doc', () => {
    const frPath = path.join(root, 'docs', 'fr', 'FR-149.md');
    const fr = assertUtf8NoBomAscii(frPath, 'docs/fr/FR-149.md');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /fr149-no-vpc-mssql-egress\.test\.js/);
    assert.match(fr, /no-?VPC|no VPC/i);

    const gapPath = path.join(
      root,
      'docs',
      'release-gap-aws-installable-2026-10-09.md',
    );
    const gap = assertUtf8NoBomAscii(gapPath, 'release-gap');
    assert.match(
      gap,
      /VPC\s*\/\s*egress to IONOS\s*\|\s*\*\*Yes\*\*[^\n]*FR-149/i,
    );
  });

  it('cdk README notes FR-149 no-VPC', () => {
    const text = fs.readFileSync(path.join(root, 'cdk', 'README.md'), 'utf8');
    assert.match(text, /FR-149/);
    assert.match(text, /no-?VPC|no VPC/i);
  });
});
