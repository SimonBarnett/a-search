'use strict';

/**
 * MRB #5061 hostile pins for FR #5058 Kelkoo soft-disable (partial).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  formatDisabledProvidersWarning,
} = require('../cdk/lib/fill-madeira-ssm-env');
const {
  requiredBundledEnvKeys,
} = require('../cdk/lib/provider-env-assert');

describe('MRB #5061 hostile FR #5058', () => {
  it('kelkoo required keys stay API_KEY + PUBLISHER_ID (no SM names)', () => {
    assert.deepEqual(requiredBundledEnvKeys('kelkoo').sort(), [
      'KELKOO_API_KEY',
      'KELKOO_PUBLISHER_ID',
    ].sort());
  });

  it('warning never embeds secret-looking values', () => {
    const msg = formatDisabledProvidersWarning([
      {
        id: 'kelkoo',
        message:
          'provider env kelkoo: missing file D:/x/providers/live/kelkoo/.env. Fill providers/live/kelkoo/.env from .env.example. Required: KELKOO_API_KEY, KELKOO_PUBLISHER_ID',
      },
    ]);
    assert.match(msg, /kelkoo\/\.env/);
    assert.doesNotMatch(msg, /password=|Bearer |eyJ[A-Za-z0-9_-]{20,}/);
  });

  it('stack still soft-disables when env missing (no silent fan-out)', () => {
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /credentialDisabled\.push/);
    assert.match(stack, /softCheckProviderEnvFileKeys/);
    assert.doesNotMatch(stack, /Secrets Manager JSON keys/);
  });
});
