'use strict';

/**
 * FR #4504: fill-madeira-ssm-env.js must read the real kebab-case /madeira/*
 * SSM parameter names (not SCREAMING_SNAKE path segments that do not exist).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  MADEIRA_ENV_PARAMS,
  fillMadeiraProviderEnv,
} = require('../cdk/lib/fill-madeira-ssm-env');

const EXPECTED_AMAZON = [
  ['/madeira/amazon/access-key', 'AMAZON_ACCESS_KEY', true],
  ['/madeira/amazon/secret-key', 'AMAZON_SECRET_KEY', true],
  ['/madeira/amazon/associate-tag', 'AMAZON_PARTNER_TAG', true],
  ['/madeira/amazon/host', 'AMAZON_HOST', true],
  ['/madeira/amazon/region', 'AMAZON_REGION', true],
];

const EXPECTED_EBAY = [
  ['/madeira/ebay/client-id', 'EBAY_CLIENT_ID', true],
  ['/madeira/ebay/client-secret', 'EBAY_CLIENT_SECRET', true],
  ['/madeira/ebay/campaign-id', 'EBAY_CAMPAIGN_ID', true],
  ['/madeira/ebay/marketplace-id', 'EBAY_MARKETPLACE_ID', true],
  ['/madeira/ebay/refresh-token', 'EBAY_REFRESH_TOKEN', false],
];

describe('FR #4504 madeira SSM param names', () => {
  it('MADEIRA_ENV_PARAMS lists the exact kebab-case SSM paths', () => {
    assert.deepEqual(MADEIRA_ENV_PARAMS.amazon, EXPECTED_AMAZON);
    assert.deepEqual(MADEIRA_ENV_PARAMS.ebay, EXPECTED_EBAY);
  });

  it('fill stub is asked only for those SSM names and maps associate-tag', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4504-ssm-'));
    const asked = [];
    const values = {
      '/madeira/amazon/access-key': 'FAKE_AK',
      '/madeira/amazon/secret-key': 'FAKE_SK',
      '/madeira/amazon/associate-tag': 'FAKE_TAG',
      '/madeira/amazon/host': 'webservices.amazon.co.uk',
      '/madeira/amazon/region': 'eu-west-1',
      '/madeira/ebay/client-id': 'FAKE_ID',
      '/madeira/ebay/client-secret': 'FAKE_ES',
      '/madeira/ebay/campaign-id': 'FAKE_CP',
      '/madeira/ebay/marketplace-id': 'EBAY_GB',
      '/madeira/etsy/api-key': 'FAKE_ETSY_KEY',
    };
    fillMadeiraProviderEnv({
      repoRoot: root,
      getParameter: (name) => {
        asked.push(name);
        return values[name] || '';
      },
    });
    assert.deepEqual(
      asked,
      [
        ...EXPECTED_AMAZON.map((r) => r[0]),
        ...EXPECTED_EBAY.map((r) => r[0]),
        ...((MADEIRA_ENV_PARAMS.etsy || []).map((r) => r[0])),
      ],
    );
    const amazon = fs.readFileSync(
      path.join(root, 'providers', 'live', 'amazon', '.env'),
      'utf8',
    );
    assert.match(amazon, /AMAZON_PARTNER_TAG=FAKE_TAG/);
    assert.match(amazon, /AMAZON_ACCESS_KEY=FAKE_AK/);
    const ebay = fs.readFileSync(
      path.join(root, 'providers', 'live', 'ebay', '.env'),
      'utf8',
    );
    assert.match(ebay, /EBAY_CLIENT_ID=FAKE_ID/);
    assert.equal(ebay.includes('EBAY_REFRESH_TOKEN'), false);
  });

  it('missing required param disables provider (no throw) and never leaks a value', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4504-miss-'));
    const sentinel = 'FAKE_SHOULD_NOT_LEAK';
    const { written, disabled } = fillMadeiraProviderEnv({
      repoRoot: root,
      getParameter: () => '',
    });
    assert.equal(written.length, 0);
    assert.ok(disabled.some((d) => d.id === 'amazon'));
    const amazon = disabled.find((d) => d.id === 'amazon');
    assert.ok(amazon.missingKeys.includes('/madeira/amazon/access-key'));
    const blob = JSON.stringify(disabled);
    assert.equal(blob.includes(sentinel), false);
    assert.equal(blob.includes('AMAZON_ACCESS_KEY'), false);
  });
});
