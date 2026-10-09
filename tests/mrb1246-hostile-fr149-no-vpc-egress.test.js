'use strict';

/**
 * MRB #1246 hostile pin: FR-149 explicit no-VPC + deploy.md fixed-egress allowlist.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');
const DEPLOY = path.join(ROOT, 'docs', 'deploy.md');
const ENVDOC = path.join(ROOT, 'docs', 'environments.md');
const FR = path.join(ROOT, 'docs', 'fr', 'FR-149.md');
const GAP = path.join(ROOT, 'docs', 'release-gap-aws-installable-2026-10-09.md');
const CDK_README = path.join(ROOT, 'cdk', 'README.md');
const PIN = path.join(ROOT, 'tests', 'fr149-no-vpc-mssql-egress.test.js');
const MRB_DOC = path.join(ROOT, 'docs', 'mrb', 'mrb-1246.md');

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

describe('MRB-1246 hostile FR-149 no-VPC MSSQL egress', () => {
  it('stack contiguous FR-149 no-VPC; no aws-ec2 / ec2.Vpc constructs', () => {
    const text = fs.readFileSync(STACK, 'utf8');
    assert.ok(text.includes('FR-149'));
    assert.match(text, /explicit no-VPC/);
    assert.match(text, /no ec2\.Vpc/);
    assert.doesNotMatch(text, /require\(['"]aws-cdk-lib\/aws-ec2['"]\)/);
    assert.doesNotMatch(text, /\bnew\s+ec2\.Vpc\b/);
    assert.doesNotMatch(text, /\bNatProvider\b/);
  });

  it('deploy.md section 9 + release-gap Yes + Decision LOCKED; no invented private IPs', () => {
    assert.ok(fs.existsSync(PIN));
    const deploy = assertUtf8NoBomAscii(DEPLOY, 'docs/deploy.md');
    assert.match(deploy, /## 9\. MSSQL network path - no-VPC \+ fixed egress \(FR-149\)/);
    assert.match(deploy, /fixed egress allowlist/);
    assert.match(deploy, /FR-122 option A/);
    assert.match(deploy, /SQL TCP/);
    assert.match(deploy, /1433/);

    const start = deploy.search(/## 9\. MSSQL network path/);
    assert.ok(start >= 0);
    const rest = deploy.slice(start);
    const next = rest.search(/\n## /);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    assert.match(section, /never[\s\S]{0,40}commit[\s\S]{0,40}CIDRs/i);
    assert.match(section, /private IPs into this repo/i);
    assert.doesNotMatch(section, PRIVATE_IPV4);

    const fr = assertUtf8NoBomAscii(FR, 'docs/fr/FR-149.md');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);

    const gap = assertUtf8NoBomAscii(GAP, 'release-gap');
    assert.match(gap, /VPC\s*\/\s*egress[^\n]*\*\*Yes\*\*[^\n]*FR-149/i);

    const env = fs.readFileSync(ENVDOC, 'utf8');
    assert.ok(env.includes('FR-149'));
    assert.match(env, /no-?VPC/i);

    const cdkReadme = fs.readFileSync(CDK_README, 'utf8');
    assert.ok(cdkReadme.includes('FR-149'));
    assert.match(cdkReadme, /no-VPC/);
  });

  it('docs/mrb-1246 board cites covering PRs', () => {
    assert.ok(fs.existsSync(MRB_DOC));
    const board = fs.readFileSync(MRB_DOC, 'utf8');
    assert.ok(board.includes('#1246'));
    assert.ok(board.includes('#985'));
    assert.ok(board.includes('FR-149'));
    assert.ok(board.includes('no-VPC'));
  });
});
