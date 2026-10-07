'use strict';

/** Hostile pins for FR-057a / MRB #363 — shared buildTrackedUrl */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const helperPath = path.join(root, 'shared', 'links', 'buildTrackedUrl.js');

describe('hostile MRB #363 FR-057a buildTrackedUrl', () => {
  it('helper lives under shared/links and cites JWT userId tenant', () => {
    assert.ok(fs.existsSync(helperPath));
    const src = fs.readFileSync(helperPath, 'utf8');
    assert.match(src, /JWT.*userId|userId.*tenant/i);
    assert.match(src, /Never hardcode publisher|never hardcode publisher/i);
    assert.match(src, /FR-057a/);
    assert.doesNotMatch(src, /<<<<<<<|=======|>>>>>>>/);
  });

  it('fail-closed: empty userId and empty requiredAccountKeys', () => {
    const { buildTrackedUrl, TrackedUrlError } = require(helperPath);
    assert.throws(
      () =>
        buildTrackedUrl({
          url: 'https://example.test/x',
          userId: '',
          envVars: { AMAZON_PARTNER_TAG: 't' },
          requiredAccountKeys: ['AMAZON_PARTNER_TAG'],
        }),
      (err) =>
        err instanceof TrackedUrlError &&
        err.code === 'tracked_url_missing_userId',
    );
    assert.throws(
      () =>
        buildTrackedUrl({
          url: 'https://example.test/x',
          userId: 'U1',
          envVars: { AMAZON_PARTNER_TAG: 't' },
          requiredAccountKeys: [],
        }),
      (err) =>
        err instanceof TrackedUrlError &&
        err.code === 'tracked_url_missing_account',
    );
  });

  it('DEFAULT_ACCOUNT_QUERY_MAP covers amazon + awin account keys', () => {
    const { DEFAULT_ACCOUNT_QUERY_MAP } = require(helperPath);
    assert.equal(DEFAULT_ACCOUNT_QUERY_MAP.AMAZON_PARTNER_TAG, 'tag');
    assert.equal(DEFAULT_ACCOUNT_QUERY_MAP.AWIN_PUBLISHER_ID, 'awinaffid');
  });
});
