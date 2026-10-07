'use strict';

/** FR-057a: shared buildTrackedUrl helper */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const helperPath = path.join(
  __dirname,
  '..',
  'shared',
  'links',
  'buildTrackedUrl.js',
);

describe('FR-057a buildTrackedUrl', () => {
  it('shared/links/buildTrackedUrl.js exists', () => {
    assert.ok(fs.existsSync(helperPath), 'helper must live at shared/links/');
  });

  it('exports buildTrackedUrl + TrackedUrlError', () => {
    const mod = require(helperPath);
    assert.equal(typeof mod.buildTrackedUrl, 'function');
    assert.equal(typeof mod.TrackedUrlError, 'function');
  });

  it('rejects empty userId', () => {
    const { buildTrackedUrl, TrackedUrlError } = require(helperPath);
    for (const userId of ['', '   ', null, undefined]) {
      assert.throws(
        () =>
          buildTrackedUrl({
            url: 'https://example.test/p/1',
            userId,
            envVars: { AMAZON_PARTNER_TAG: 'tag-20' },
            requiredAccountKeys: ['AMAZON_PARTNER_TAG'],
          }),
        (err) =>
          err instanceof TrackedUrlError &&
          err.code === 'tracked_url_missing_userId',
      );
    }
  });

  it('rejects missing required account key (fail closed)', () => {
    const { buildTrackedUrl, TrackedUrlError } = require(helperPath);
    assert.throws(
      () =>
        buildTrackedUrl({
          url: 'https://example.test/p/1',
          userId: 'U1',
          envVars: {},
          requiredAccountKeys: ['AMAZON_PARTNER_TAG'],
        }),
      (err) =>
        err instanceof TrackedUrlError &&
        err.code === 'tracked_url_missing_account' &&
        /AMAZON_PARTNER_TAG/.test(err.message),
    );
  });

  it('two userIds differ (JWT tenant stamp)', () => {
    const { buildTrackedUrl } = require(helperPath);
    const base = {
      url: 'https://www.amazon.co.uk/dp/B0TEST',
      envVars: { AMAZON_PARTNER_TAG: 'tag-20' },
      requiredAccountKeys: ['AMAZON_PARTNER_TAG'],
      accountQueryMap: { AMAZON_PARTNER_TAG: 'tag' },
    };
    const a = buildTrackedUrl({ ...base, userId: 'user-A' });
    const b = buildTrackedUrl({ ...base, userId: 'user-B' });
    assert.notEqual(a, b);
    assert.match(a, /userId=user-A/);
    assert.match(b, /userId=user-B/);
    assert.match(a, /tag=tag-20/);
    assert.match(b, /tag=tag-20/);
  });

  it('two publisher env values differ', () => {
    const { buildTrackedUrl } = require(helperPath);
    const base = {
      url: 'https://www.awin1.com/cread.php?awinaffid=PLACEHOLDER',
      userId: 'U-TENANT',
      requiredAccountKeys: ['AWIN_PUBLISHER_ID'],
      accountQueryMap: { AWIN_PUBLISHER_ID: 'awinaffid' },
    };
    const a = buildTrackedUrl({
      ...base,
      envVars: { AWIN_PUBLISHER_ID: 'pub-111' },
    });
    const b = buildTrackedUrl({
      ...base,
      envVars: { AWIN_PUBLISHER_ID: 'pub-222' },
    });
    assert.notEqual(a, b);
    assert.match(a, /awinaffid=pub-111/);
    assert.match(b, /awinaffid=pub-222/);
    assert.match(a, /userId=U-TENANT/);
    assert.match(b, /userId=U-TENANT/);
  });

  it('preserves existing query params on the base URL', () => {
    const { buildTrackedUrl } = require(helperPath);
    const out = buildTrackedUrl({
      url: 'https://example.test/p?sku=9',
      userId: 'U1',
      env: 'sandbox',
      envVars: { AMAZON_PARTNER_TAG: 'tag-20' },
      requiredAccountKeys: ['AMAZON_PARTNER_TAG'],
      accountQueryMap: { AMAZON_PARTNER_TAG: 'tag' },
    });
    assert.match(out, /sku=9/);
    assert.match(out, /userId=U1/);
    assert.match(out, /tag=tag-20/);
    assert.match(out, /a_search_env=sandbox/);
  });

  it('rejects non-http(s) / empty url', () => {
    const { buildTrackedUrl, TrackedUrlError } = require(helperPath);
    assert.throws(
      () =>
        buildTrackedUrl({
          url: '',
          userId: 'U1',
          envVars: { AMAZON_PARTNER_TAG: 't' },
          requiredAccountKeys: ['AMAZON_PARTNER_TAG'],
        }),
      (err) =>
        err instanceof TrackedUrlError && err.code === 'tracked_url_bad_url',
    );
  });
});
