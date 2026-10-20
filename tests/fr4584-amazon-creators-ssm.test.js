'use strict';

/**
 * FR #4584: fill-madeira maps optional /madeira/amazon/creators-credential
 * -> AMAZON_CREATORS_CREDENTIAL (ParameterNotFound / empty skips; never fail deploy).
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

const REQUIRED_AMAZON = {
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

describe('FR #4584 amazon creators-credential SSM', () => {
  it('MADEIRA_ENV_PARAMS maps creators-credential optionally', () => {
    const row = MADEIRA_ENV_PARAMS.amazon.find(
      (r) => r[1] === 'AMAZON_CREATORS_CREDENTIAL',
    );
    assert.ok(row, 'missing AMAZON_CREATORS_CREDENTIAL row');
    assert.equal(row[0], '/madeira/amazon/creators-credential');
    assert.equal(row[2], false);
  });

  it('writes AMAZON_CREATORS_CREDENTIAL when SSM value present', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4584-creators-'));
    fillMadeiraProviderEnv({
      repoRoot: root,
      getParameter: (name) => {
        if (name === '/madeira/amazon/creators-credential') {
          return 'FAKE_CREATORS_CRED';
        }
        return REQUIRED_AMAZON[name] || '';
      },
    });
    const amazon = fs.readFileSync(
      path.join(root, 'providers', 'live', 'amazon', '.env'),
      'utf8',
    );
    assert.match(amazon, /AMAZON_CREATORS_CREDENTIAL=FAKE_CREATORS_CRED/);
    assert.equal(amazon.includes('FAKE_CREATORS_CRED\n') || amazon.includes('FAKE_CREATORS_CRED'), true);
  });

  it('omits AMAZON_CREATORS_CREDENTIAL when SSM param missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4584-nocred-'));
    fillMadeiraProviderEnv({
      repoRoot: root,
      getParameter: (name) => REQUIRED_AMAZON[name] || '',
    });
    const amazon = fs.readFileSync(
      path.join(root, 'providers', 'live', 'amazon', '.env'),
      'utf8',
    );
    assert.equal(amazon.includes('AMAZON_CREATORS_CREDENTIAL'), false);
    assert.match(amazon, /AMAZON_ACCESS_KEY=FAKE_AK/);
  });
});
