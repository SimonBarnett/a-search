'use strict';

/**
 * FR-158: document Lambda intake egress to irc.ntsa.uk (measure + fail-soft).
 * No invented private IPs / firewall dumps in git.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

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

describe('FR-158 Lambda intake egress docs + fail-soft', () => {
  it('intake-on-exception.md replaces UNKNOWN with measure + env + fail-soft', () => {
    const docPath = path.join(root, 'docs', 'intake-on-exception.md');
    const text = assertUtf8NoBomAscii(docPath, 'docs/intake-on-exception.md');
    assert.match(text, /FR-158/);
    assert.doesNotMatch(text, /\bUNKNOWN\b/);
    assert.match(text, /A_SEARCH_INTAKE_URL|BOB_INTAKE_URL/);
    assert.match(text, /fail-?soft|egressBlocked|intake_egress/i);
    assert.match(text, /measure|curl|Invoke-WebRequest/i);
    assert.match(text, /FR-149|no-?VPC/i);
    assert.match(text, /irc\.ntsa\.uk/);
    assert.doesNotMatch(text, PRIVATE_IPV4);
  });

  it('deploy.md FR-158 section + smoke checklist item; ASCII', () => {
    const deployPath = path.join(root, 'docs', 'deploy.md');
    const text = assertUtf8NoBomAscii(deployPath, 'docs/deploy.md');
    assert.match(text, /FR-158/);
    assert.match(text, /A_SEARCH_INTAKE_URL|intake egress/i);
    const start = text.search(/##[^\n]*FR-158/);
    assert.ok(start >= 0, 'missing FR-158 heading in deploy.md');
    const rest = text.slice(start);
    const next = rest.search(/\n## /);
    const section = next >= 0 ? rest.slice(0, next) : rest;
    assert.match(section, /measure|egress/i);
    assert.match(section, /FR-149/);
    assert.doesNotMatch(section, PRIVATE_IPV4);
    // Smoke checklist mentions intake egress measure
    assert.match(text, /Smoke[\s\S]{0,2500}intake|intake[\s\S]{0,400}smoke/i);
  });

  it('FR-158 Decision LOCKED + release-gap Yes; CDK links FR-149/FR-158', () => {
    const frPath = path.join(root, 'docs', 'fr', 'FR-158.md');
    const fr = assertUtf8NoBomAscii(frPath, 'docs/fr/FR-158.md');
    assert.match(fr, /Decision LOCKED/i);
    assert.match(fr, /fr158-intake-egress-docs\.test\.js/);

    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /Intake egress[^\n]*FR-158[^\n]*\*\*Yes\*\*/i);

    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /FR-158/);
    assert.match(stack, /FR-149/);
  });

  it('resolveIntakeUrl prefers opts then A_SEARCH_INTAKE_URL then BOB_INTAKE_URL', () => {
    const {
      resolveIntakeUrl,
      DEFAULT_INTAKE_URL,
    } = require('../shared/intake/reportException');
    assert.equal(resolveIntakeUrl({ intakeUrl: 'https://example.test/i' }), 'https://example.test/i');
    const prevA = process.env.A_SEARCH_INTAKE_URL;
    const prevB = process.env.BOB_INTAKE_URL;
    try {
      delete process.env.A_SEARCH_INTAKE_URL;
      delete process.env.BOB_INTAKE_URL;
      assert.equal(resolveIntakeUrl({}), DEFAULT_INTAKE_URL);
      process.env.BOB_INTAKE_URL = 'https://bob.example/intake';
      assert.equal(resolveIntakeUrl({}), 'https://bob.example/intake');
      process.env.A_SEARCH_INTAKE_URL = 'https://a-search.example/intake';
      assert.equal(resolveIntakeUrl({}), 'https://a-search.example/intake');
    } finally {
      if (prevA === undefined) delete process.env.A_SEARCH_INTAKE_URL;
      else process.env.A_SEARCH_INTAKE_URL = prevA;
      if (prevB === undefined) delete process.env.BOB_INTAKE_URL;
      else process.env.BOB_INTAKE_URL = prevB;
    }
  });

  it('reportException fail-soft on fetch throw: egressBlocked + log, no throw', async () => {
    const {
      reportException,
      clearReportExceptionDedupe,
    } = require('../shared/intake/reportException');
    clearReportExceptionDedupe();
    const logs = [];
    const prevErr = console.error;
    console.error = (...args) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      const err = new Error('fatal');
      err.code = 'unit_egress';
      const result = await reportException({
        err,
        route: 'entry/POST /search',
        fetch: async () => {
          throw Object.assign(new Error('getaddrinfo ENOTFOUND'), {
            code: 'ENOTFOUND',
          });
        },
      });
      assert.equal(result.ok, false);
      assert.equal(result.egressBlocked, true);
      assert.match(String(result.code || ''), /intake_egress/i);
      assert.ok(logs.some((l) => /intake_egress|egress/i.test(l)));
    } finally {
      console.error = prevErr;
    }
  });
});
