'use strict';

/**
 * FR-222 / #1227: Partner/club Stripe payouts optional until payout requested.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-222.md');
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');
const MOCK = path.join(
  ROOT,
  'docs',
  'mocks',
  'components-piece-partner',
  'home.html',
);

const {
  createTenantRegistry,
  registerTenant,
  requestPayout,
  startPayoutSetup,
} = require('../shared/partners/payoutOptional');
const {
  handleAccountPayouts,
  matchAccountPayoutsRoute,
} = require('../entry/src/accountPayouts');

describe('FR-222 payout optional until requested', () => {
  it('docs/fr/FR-222.md Decision LOCKED ASCII no-BOM', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'FR-222.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /optional/i);
    assert.match(text, /\/account\/payouts/);
    assert.match(text, /Stripe/);
    assert.match(text, /partner|club/i);
  });

  it('register without Stripe payout id succeeds; payoutOptional true', () => {
    const registry = createTenantRegistry();
    const partner = registerTenant({
      registry,
      role: 'partner',
      tenantCode: 'AB12CD34',
      email: 'p@example.com',
    });
    assert.equal(partner.stripePayoutAccountId, null);
    assert.equal(partner.payoutOptional, true);
    assert.equal(partner.status, 'active');

    const club = registerTenant({
      registry,
      role: 'club',
      tenantCode: 'CLUB0001',
    });
    assert.equal(club.stripePayoutAccountId, null);
    assert.equal(club.payoutOptional, true);
  });

  it('payout request without account => setup path; startPayoutSetup creates account', async () => {
    const registry = createTenantRegistry();
    const partner = registerTenant({
      registry,
      role: 'partner',
      tenantCode: 'ZZ99YY88',
    });

    const asked = requestPayout({
      registry,
      tenantCode: partner.tenantCode,
    });
    assert.equal(asked.setupRequired, true);
    assert.equal(asked.ok, false);
    assert.match(asked.setupPath, /\/account\/stripe\/link|setup/i);

    const created = await startPayoutSetup({
      registry,
      tenantCode: partner.tenantCode,
      createConnectAccount: async () => ({ id: 'acct_FAKE_CONNECT_1' }),
      createAccountLink: async () => ({
        url: 'https://connect.stripe.com/setup/FAKE',
      }),
    });
    assert.equal(created.stripePayoutAccountId, 'acct_FAKE_CONNECT_1');
    assert.match(created.setupUrl, /connect\.stripe\.com/);

    const again = requestPayout({
      registry,
      tenantCode: partner.tenantCode,
    });
    assert.equal(again.setupRequired, false);
    assert.equal(again.ok, true);
    assert.equal(again.stripePayoutAccountId, 'acct_FAKE_CONNECT_1');
  });

  it('HTTP POST /account/payouts; CDK + mock pins', async () => {
    assert.equal(
      matchAccountPayoutsRoute('POST', '/account/payouts'),
      'POST /account/payouts',
    );
    const registry = createTenantRegistry();
    registerTenant({
      registry,
      role: 'partner',
      tenantCode: 'HTTP0001',
    });

    const res = await handleAccountPayouts(
      {
        headers: { authorization: 'Bearer x' },
        body: JSON.stringify({ tenantCode: 'HTTP0001' }),
      },
      {
        registry,
        verifyAuthorization: async () => ({ userId: 'HTTP0001' }),
      },
    );
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.setupRequired, true);
    assert.ok(body.setupPath);

    const stack = fs.readFileSync(STACK, 'utf8');
    assert.match(stack, /path:\s*'\/account\/payouts'/);

    const mock = fs.readFileSync(MOCK, 'utf8');
    assert.match(mock, /optional until/i);
  });
});
