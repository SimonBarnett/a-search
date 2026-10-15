'use strict';

/**
 * #1344 Chrome extension gate + account/widget mutate APIs.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const { shouldInjectTopBar, hostChanged } = require('../shared/extension/gate');
const { findJwtStorageViolations } = require('../shared/extension/jwtPolicy');
const {
  createWidgetsRegistry,
  createWidget,
  mintWidgetGuid,
} = require('../shared/widgets/createWidget');
const { withWidgetLookup } = require('../shared/widgets/patchWidget');
const { createFeedbackStore } = require('../shared/widgets/feedbackStore');
const { createCommissionStore } = require('../shared/account/commission');
const { createUpgradeCache } = require('../shared/account/upgrade');
const {
  matchAccountCommissionRoute,
  handleAccountCommission,
} = require('../entry/src/accountCommission');
const {
  matchAccountUpgradeRoute,
  handleAccountUpgrade,
} = require('../entry/src/accountUpgrade');
const {
  matchWidgetsMutateRoute,
  handleWidgetsMutate,
} = require('../entry/src/widgetsMutate');
const { handler } = require('../entry/src/index');

function authDeps(userId) {
  return {
    verifyAuthorization: async () => ({ userId }),
  };
}

describe('FR-1344 chrome extension', () => {
  it('gate: Club TXT required; Partner alone inert; hostChanged', () => {
    assert.equal(shouldInjectTopBar({ enabled: false, clubId: null }), false);
    assert.equal(
      shouldInjectTopBar({ enabled: true, clubId: null, partnerId: 'P1' }),
      false,
    );
    assert.equal(
      shouldInjectTopBar({ enabled: true, clubId: 'CLUB0001', partnerId: null }),
      true,
    );
    assert.equal(hostChanged('a.com', 'a.com'), false);
    assert.equal(hostChanged('a.com', 'b.com'), true);
  });

  it('extension sources: manifest MV3; JWT sinks forbidden; disabled path adds zero DOM markers', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'),
    );
    assert.equal(manifest.manifest_version, 3);
    assert.ok(manifest.background && manifest.background.service_worker);
    assert.ok(
      Array.isArray(manifest.content_scripts) &&
        manifest.content_scripts.length >= 1,
    );
    const bg = fs.readFileSync(
      path.join(ROOT, 'extension', 'background.js'),
      'utf8',
    );
    const content = fs.readFileSync(
      path.join(ROOT, 'extension', 'content.js'),
      'utf8',
    );
    assert.equal(findJwtStorageViolations(bg).length, 0);
    assert.equal(findJwtStorageViolations(content).length, 0);
    assert.match(bg, /chrome\.storage\.session/);
    assert.match(content, /shouldInject|enabled/);
    assert.match(content, /attachShadow/);
    // content script removes bar when gate fails
    assert.match(content, /removeBar|removeChild/);
  });

  it('GET /account/commission returns unclaimedMinor for JWT user', async () => {
    assert.equal(
      matchAccountCommissionRoute('GET', '/account/commission'),
      'GET /account/commission',
    );
    const store = createCommissionStore();
    store.setUnclaimed('TESTUSR1', 1234, 'GBP');
    const res = await handleAccountCommission(
      { headers: { authorization: 'Bearer x' } },
      { ...authDeps('TESTUSR1'), commissionStore: store },
    );
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.unclaimedMinor, 1234);
    assert.equal(body.currency, 'GBP');
  });

  it('POST /account/upgrade returns checkout URL stub', async () => {
    assert.equal(
      matchAccountUpgradeRoute('POST', '/account/upgrade'),
      'POST /account/upgrade',
    );
    const res = await handleAccountUpgrade(
      {
        headers: { authorization: 'Bearer x' },
        body: JSON.stringify({ host: 'shop.example' }),
      },
      authDeps('TESTUSR1'),
    );
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.ok, true);
    assert.match(body.url, /checkout\.stripe\.com/);
  });

  it('PATCH fullscreen without upgrade => 402; with upgrade ok; feedback other requires text', async () => {
    const registry = withWidgetLookup(createWidgetsRegistry());
    const created = createWidget({
      layout: 'horizontal',
      createdVia: 'extension',
      host: 'shop.example',
      registry,
    });
    const upgradeCache = createUpgradeCache();
    const feedbackStore = createFeedbackStore();
    const deps = {
      ...authDeps('CLUB0001'),
      widgetRegistry: registry,
      upgradeCache,
      feedbackStore,
    };

    assert.equal(
      matchWidgetsMutateRoute('PATCH', `/widgets/${created.widgetGuid}`),
      'PATCH /widgets/{widgetGuid}',
    );

    const denied = await handleWidgetsMutate(
      {
        headers: { authorization: 'Bearer x' },
        rawPath: `/widgets/${created.widgetGuid}`,
        body: JSON.stringify({ layout: 'fullscreen', host: 'shop.example' }),
      },
      'PATCH /widgets/{widgetGuid}',
      deps,
    );
    assert.equal(denied.statusCode, 402);
    assert.equal(JSON.parse(denied.body).error, 'upgrade_required');

    upgradeCache.setUpgraded('shop.example', true);
    const ok = await handleWidgetsMutate(
      {
        headers: { authorization: 'Bearer x' },
        rawPath: `/widgets/${created.widgetGuid}`,
        body: JSON.stringify({ layout: 'fullscreen', host: 'shop.example' }),
      },
      'PATCH /widgets/{widgetGuid}',
      deps,
    );
    assert.equal(ok.statusCode, 200);
    assert.equal(JSON.parse(ok.body).widget.layout, 'fullscreen');

    const badOther = await handleWidgetsMutate(
      {
        headers: { authorization: 'Bearer x' },
        rawPath: `/widgets/${created.widgetGuid}/feedback`,
        body: JSON.stringify({
          type: 'remove',
          reason: 'other',
          partNumber: 'p-1',
        }),
      },
      'POST /widgets/{widgetGuid}/feedback',
      deps,
    );
    assert.equal(badOther.statusCode, 400);
    assert.equal(JSON.parse(badOther.body).error, 'other_text_required');

    const good = await handleWidgetsMutate(
      {
        headers: { authorization: 'Bearer x' },
        rawPath: `/widgets/${created.widgetGuid}/feedback`,
        body: JSON.stringify({
          type: 'remove',
          reason: 'other',
          otherText: 'not a fit',
          partNumber: 'p-1',
        }),
      },
      'POST /widgets/{widgetGuid}/feedback',
      deps,
    );
    assert.equal(good.statusCode, 200);
    assert.equal(JSON.parse(good.body).entry.reason, 'other');
  });

  it('entry handler dispatches commission/upgrade/mutate before 501 stubs; two widget guids distinct', async () => {
    const store = createCommissionStore();
    store.setUnclaimed('TESTUSR1', 50, 'GBP');
    const res = await handler(
      {
        requestContext: {
          http: { method: 'GET', path: '/account/commission' },
        },
        rawPath: '/account/commission',
        headers: { authorization: 'Bearer x' },
      },
      {},
      { ...authDeps('TESTUSR1'), commissionStore: store },
    );
    assert.equal(res.statusCode, 200);
    assert.notEqual(JSON.parse(res.body).error, 'not_implemented');

    const g1 = mintWidgetGuid();
    const g2 = mintWidgetGuid();
    assert.notEqual(g1, g2);
  });

  it('Decision LOCKED docs + shared files lists extension/ and account/', () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-1344.md'), 'utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(pkg.files.includes('extension/'));
    assert.ok(pkg.files.includes('account/'));
  });
});
