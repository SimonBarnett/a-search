'use strict';

/**
 * docs/mrb-4703 hostile pins for FR #4650 / PR #4703:
 * missing credentials => provider off for /search fan-out; fill never throws;
 * one warning lists key/path names only.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const {
  resolveFanOutTargets,
} = require('../entry/src/agentSearch');
const {
  fillMadeiraProviderEnv,
  formatDisabledProvidersWarning,
} = require('../cdk/lib/fill-madeira-ssm-env');
const {
  softCheckProviderEnvFileKeys,
} = require('../cdk/lib/provider-env-assert');

describe('docs/mrb-4703 hostile FR #4650 credential-off', () => {
  it('resolveFanOutTargets skips awsSearch id when envVars lack queue URL', () => {
    const targets = resolveFanOutTargets('live', {
      enabled: () => ['ebay', 'amazon'],
      loadRegistry: () => ({
        sources: [
          {
            id: 'ebay',
            kind: 'live',
            awsSearch: true,
            folder: 'providers/live/ebay',
            queueEnv: 'EBAY',
            enabled: { live: true },
          },
          {
            id: 'amazon',
            kind: 'live',
            awsSearch: true,
            folder: 'providers/live/amazon',
            queueEnv: 'AMAZON',
            enabled: { live: true },
          },
        ],
      }),
      resolveQueueUrl: ({ queueEnv, envVars }) => {
        const key = `SQS_${String(queueEnv).toUpperCase()}_LIVE_URL`;
        const url = envVars && envVars[key];
        if (!url) throw new Error(`missing ${key}`);
        return url;
      },
      envVars: {
        SQS_AMAZON_LIVE_URL: 'https://sqs.example.test/amazon',
        // ebay intentionally missing
      },
    });
    assert.deepEqual(targets, ['amazon', 'sql']);
  });

  it('fill-madeira never throws when all /madeira params empty', () => {
    const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mrb4703-'));
    assert.doesNotThrow(() => {
      const { written, disabled } = fillMadeiraProviderEnv({
        repoRoot: root,
        enabledSourceIds: ['amazon', 'ebay', 'etsy'],
        getParameter: () => '',
      });
      assert.equal(written.length, 0);
      assert.ok(disabled.length >= 3);
    });
  });

  it('formatDisabledProvidersWarning lists names only (no FAKE_ values)', () => {
    const msg = formatDisabledProvidersWarning([
      { id: 'kelkoo', missingKeys: ['KELKOO_API_KEY', 'KELKOO_PUBLISHER_ID'] },
      { id: 'etsy', missingKeys: ['/madeira/etsy/api-key'] },
    ]);
    assert.match(msg, /providers disabled \(missing credentials\)/);
    assert.match(msg, /kelkoo: missing KELKOO_API_KEY/);
    assert.match(msg, /etsy: missing \/madeira\/etsy\/api-key/);
    assert.doesNotMatch(msg, /FAKE_/);
    assert.doesNotMatch(msg, /=/);
  });

  it('softCheckProviderEnvFileKeys reports missing without throwing', () => {
    const missing = path.join(ROOT, 'providers', 'live', 'kelkoo', '.env.missing-mrb4703');
    const check = softCheckProviderEnvFileKeys(missing, 'kelkoo');
    assert.equal(check.ok, false);
    assert.ok(Array.isArray(check.missingKeys));
    assert.ok(check.missingKeys.length > 0);
  });

  it('stack tip omits entry queue URL env when credentials not ready', () => {
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk/lib/a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /missing credentials => provider off for fan-out/);
    assert.match(stack, /if \(envReady\) \{\s*\n\s*const urlKey = queueUrlEnvKey/);
    assert.match(stack, /providers disabled \(missing credentials\)/);
  });
});
