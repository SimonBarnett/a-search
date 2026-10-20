'use strict';

/**
 * FR #4510: etsy credentials come from kebab-case /madeira/etsy/* SSM
 * (same fill-madeira path as amazon/ebay / FR #4504), then bundle at deploy.
 * Values are never printed. Registry stays enabled for live+sandbox.
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

const EXPECTED_ETSY = [
  ['/madeira/etsy/api-key', 'ETSY_API_KEY', true],
  ['/madeira/etsy/shared-secret', 'ETSY_SHARED_SECRET', false],
];

const AMAZON_EBAY_STUB = {
  '/madeira/amazon/access-key': 'FAKE_AK',
  '/madeira/amazon/secret-key': 'FAKE_SK',
  '/madeira/amazon/associate-tag': 'FAKE_TAG',
  '/madeira/amazon/host': 'webservices.amazon.co.uk',
  '/madeira/amazon/region': 'eu-west-1',
  '/madeira/ebay/client-id': 'FAKE_ID',
  '/madeira/ebay/client-secret': 'FAKE_ES',
  '/madeira/ebay/campaign-id': 'FAKE_CP',
  '/madeira/ebay/marketplace-id': 'EBAY_GB',
};

describe('FR #4510 etsy SSM env fill', () => {
  it('MADEIRA_ENV_PARAMS lists kebab-case /madeira/etsy paths', () => {
    assert.deepEqual(MADEIRA_ENV_PARAMS.etsy, EXPECTED_ETSY);
  });

  it('registry keeps etsy enabled for live and sandbox', () => {
    const reg = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', 'providers', 'registry.json'),
        'utf8',
      ),
    );
    const etsy = (reg.sources || []).find((s) => s.id === 'etsy');
    assert.ok(etsy, 'etsy source missing');
    assert.equal(etsy.enabled.live, true);
    assert.equal(etsy.enabled.sandbox, true);
    assert.equal(etsy.awsSearch, true);
  });

  it('fill stub reads etsy SSM names and maps api-key to ETSY_API_KEY', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4510-etsy-'));
    const asked = [];
    const values = {
      ...AMAZON_EBAY_STUB,
      '/madeira/etsy/api-key': 'FAKE_ETSY_KEY',
    };
    fillMadeiraProviderEnv({
      repoRoot: root,
      getParameter: (name) => {
        asked.push(name);
        return values[name] || '';
      },
    });
    for (const [paramName] of EXPECTED_ETSY) {
      assert.ok(asked.includes(paramName), 'missing ask ' + paramName);
    }
    const etsyEnv = fs.readFileSync(
      path.join(root, 'providers', 'live', 'etsy', '.env'),
      'utf8',
    );
    assert.match(etsyEnv, /ETSY_API_KEY=FAKE_ETSY_KEY/);
    assert.equal(etsyEnv.includes('ETSY_SHARED_SECRET'), false);
  });

  it('missing required etsy api-key disables etsy (no throw) and never leaks a value', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4510-miss-'));
    const sentinel = 'FAKE_SHOULD_NOT_LEAK';
    const { written, disabled } = fillMadeiraProviderEnv({
      repoRoot: root,
      getParameter: (name) => {
        if (name.startsWith('/madeira/etsy/')) {
          return name.includes('api-key') ? '' : sentinel;
        }
        return AMAZON_EBAY_STUB[name] || '';
      },
    });
    assert.ok(written.length >= 2);
    const etsyOff = disabled.find((d) => d.id === 'etsy');
    assert.ok(etsyOff);
    assert.ok(etsyOff.missingKeys.includes('/madeira/etsy/api-key'));
    assert.equal(
      fs.existsSync(path.join(root, 'providers', 'live', 'etsy', '.env')),
      false,
    );
    const blob = JSON.stringify(disabled);
    assert.equal(blob.includes(sentinel), false);
    assert.equal(/ETSY_API_KEY=/.test(blob), false);
  });
});
