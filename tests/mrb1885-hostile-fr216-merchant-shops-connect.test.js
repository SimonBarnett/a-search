'use strict';

/**
 * MRB #1885 docs/hostile: FR-216 merchant shops connect orchestration pins.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('MRB #1885 hostile FR-216 merchant shops connect', () => {
  it('Decision LOCKED + routes + pending_payment + a_search migration', () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-216.md'));
    assert.notEqual(fr[0], 0xef, 'no BOM');
    const text = fr.toString('utf8');
    assert.match(text, /Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /\/merchant\/shops\/connect/);
    assert.match(text, /\/merchant\/shops\/callback/);
    assert.match(text, /pending_payment/);
    assert.match(text, /a_search/);
    // madeiradb may be named as read-only / untouched; never as the Shops home.
    assert.match(text, /madeiradb is read-only|Never modify madeiradb/i);
  });

  it('CDK wires connect JWT route + callback provider path', () => {
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /\/merchant\/shops\/connect/);
    assert.match(stack, /\/merchant\/shops\/callback\/\{provider\}/);
  });

  it('Shops migration stores CredentialsSecretRef pointer; default pending_payment', () => {
    const sql = fs.readFileSync(
      path.join(ROOT, 'db', 'migrations', '010_Shops.sql'),
      'utf8',
    );
    assert.match(sql, /CredentialsSecretRef/);
    assert.match(sql, /pending_payment/);
    assert.match(sql, /Never modify madeiradb/i);
    assert.doesNotMatch(sql, /ACCESS_TOKEN|client_secret/i);
  });

  it('connect orchestration: fixture loginRequired; credentials never on shop row', async () => {
    const {
      createNonceStore,
      createShopsRegistry,
      startConnect,
      completeConnect,
    } = require('../shared/shops/connect');
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const out = await startConnect({
      merchantUserId: 'u1',
      env: 'sandbox',
      provider: 'fixture',
      shopDomain: 'x.example',
      adapterOpts: { session: { loggedIn: false } },
      nonces,
      shops,
      nowMs: 10,
    });
    assert.equal(out.loginRequired, true);
    assert.ok(out.redirectUrl);

    const start = await startConnect({
      merchantUserId: 'u1',
      env: 'sandbox',
      provider: 'fixture',
      shopDomain: 'x.example',
      adapterOpts: {
        session: {
          loggedIn: true,
          providerShopId: 's1',
          shopDomain: 'x.example',
        },
      },
      nonces,
      shops,
      nowMs: 20,
    });
    const done = await completeConnect({
      provider: 'fixture',
      state: start.state,
      req: { query: { code: 'ok' }, body: {} },
      adapterOpts: {
        session: {
          loggedIn: true,
          providerShopId: 's1',
          shopDomain: 'x.example',
        },
      },
      nonces,
      shops,
      nowMs: 30,
      subscribeBaseUrl: 'https://example.test/subscribe',
    });
    assert.equal(done.shop.status, 'pending_payment');
    assert.ok(!('credentials' in done.shop));
    assert.ok(!JSON.stringify(done.shop).toLowerCase().includes('fixture_ok'));
  });
});
