'use strict';

/**
 * FR #5058: synth soft-disable warning names missing Kelkoo .env file + keys;
 * stale FR-167 Secrets Manager comment removed.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const {
  softCheckProviderEnvFileKeys,
} = require('../cdk/lib/provider-env-assert');
const {
  formatDisabledProvidersWarning,
} = require('../cdk/lib/fill-madeira-ssm-env');

describe('FR #5058 kelkoo soft-disable warning clarity', () => {
  it('softCheck missing file message names path, Fill hint, and keys', () => {
    const missing = path.join(
      ROOT,
      'providers',
      'live',
      'kelkoo',
      '.env.missing-fr5058',
    );
    const check = softCheckProviderEnvFileKeys(missing, 'kelkoo');
    assert.equal(check.ok, false);
    assert.match(String(check.message), /missing file/);
    assert.match(String(check.message), /\.env\.missing-fr5058|kelkoo/);
    assert.match(String(check.message), /Fill providers\/live\/kelkoo\/\.env/);
    assert.match(String(check.message), /KELKOO_API_KEY/);
    assert.match(String(check.message), /KELKOO_PUBLISHER_ID/);
    assert.doesNotMatch(String(check.message), /FAKE_|Bearer |eyJ/);
  });

  it('formatDisabledProvidersWarning prefers softCheck message with file path', () => {
    const msg = formatDisabledProvidersWarning([
      {
        id: 'kelkoo',
        missingKeys: ['KELKOO_API_KEY', 'KELKOO_PUBLISHER_ID'],
        filePath: 'providers/live/kelkoo/.env',
        message:
          'provider env kelkoo: missing file providers/live/kelkoo/.env. Fill providers/live/kelkoo/.env from .env.example. Required: KELKOO_API_KEY, KELKOO_PUBLISHER_ID',
      },
    ]);
    assert.match(msg, /providers disabled \(missing credentials\)/);
    assert.match(msg, /providers\/live\/kelkoo\/\.env/);
    assert.match(msg, /KELKOO_API_KEY/);
    assert.match(msg, /KELKOO_PUBLISHER_ID/);
    assert.doesNotMatch(msg, /FAKE_/);
  });

  it('stack stores softCheck message and no longer claims Secrets Manager for Kelkoo', () => {
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.doesNotMatch(
      stack,
      /FR-167: enable kelkoo \(Secrets Manager JSON keys\)/,
    );
    assert.match(stack, /bundled providers\/live\/kelkoo\/\.env/);
    assert.match(stack, /filePath:\s*envFile/);
    assert.match(stack, /message:\s*envCheck\.message/);
    assert.match(stack, /if \(row\.message\) return/);
  });

  it('kelkoo .env.example documents gitignored .env fill (no SM)', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'providers', 'live', 'kelkoo', '.env.example'),
      'utf8',
    );
    assert.match(text, /KELKOO_API_KEY=/);
    assert.match(text, /KELKOO_PUBLISHER_ID=/);
    assert.match(text, /gitignored|\.env/);
    assert.doesNotMatch(text, /secrets via SM only/i);
    assert.equal(text.charCodeAt(0) === 0xfeff, false);
  });
});
