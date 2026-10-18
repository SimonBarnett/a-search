'use strict';

/**
 * FR #4336: amazon and ebay credentials come from an env file, not Secrets Manager.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readProviderEnvFile } = require('../cdk/lib/a-search-stack');

const root = path.join(__dirname, '..');
const fixtures = path.join(root, 'tests', 'fixtures', 'provider-env');

describe('FR #4336 provider env files', () => {
  it('reads fixture keys and drops an empty optional refresh token', () => {
    const amazon = readProviderEnvFile(root, 'amazon', fixtures);
    assert.equal(amazon.AMAZON_ACCESS_KEY, 'FAKE_AK');
    assert.equal(amazon.AMAZON_HOST, 'webservices.amazon.co.uk');
    assert.equal(Object.hasOwn(amazon, 'AMAZON_CREATORS_CREDENTIAL'), false);

    const ebay = readProviderEnvFile(root, 'ebay', fixtures);
    assert.equal(ebay.EBAY_CLIENT_SECRET, 'FAKE_ES');
    assert.equal(ebay.EBAY_MARKETPLACE_ID, 'EBAY_GB');
    assert.equal(Object.hasOwn(ebay, 'EBAY_ENV'), false);
    assert.equal(Object.hasOwn(ebay, 'EBAY_REFRESH_TOKEN'), false);
  });

  it('fails when a required key is missing and does not echo a present value', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4336-'));
    const sentinel = 'FAKE_LEAK';
    fs.writeFileSync(
      path.join(dir, 'amazon.env'),
      `AMAZON_ACCESS_KEY=${sentinel}\nAMAZON_HOST=webservices.amazon.co.uk\n`,
      'utf8',
    );
    assert.throws(
      () => readProviderEnvFile(root, 'amazon', dir),
      (err) => {
        const message = String(err && err.message);
        assert.match(message, /missing required/);
        assert.match(message, /AMAZON_SECRET_KEY/);
        assert.equal(message.includes(sentinel), false);
        return true;
      },
    );
  });

  it('fails when the env file is absent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4336-miss-'));
    assert.throws(
      () => readProviderEnvFile(root, 'ebay', dir),
      /missing file/,
    );
  });
});
