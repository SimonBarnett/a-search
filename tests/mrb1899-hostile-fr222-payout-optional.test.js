'use strict';

/**
 * MRB #1899 docs/hostile: FR-222 payout optional.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  createTenantRegistry,
  registerTenant,
  requestPayout,
} = require('../shared/partners/payoutOptional');

describe('MRB #1899 hostile FR-222 payout optional', () => {
  it('Decision LOCKED; optional tenant; CDK+entry payout routes; partners packed', () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-222.md'), 'utf8');
    assert.match(fr, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(fr, /payoutOptional/);
    assert.match(fr, /\/account\/payouts/);
    assert.match(fr, /\/account\/stripe\/link/);

    const registry = createTenantRegistry();
    const t = registerTenant({
      registry,
      role: 'partner',
      tenantCode: 'ABCD1234',
    });
    assert.equal(t.payoutOptional, true);
    assert.equal(t.stripePayoutAccountId, null);
    const req = requestPayout({ registry, tenantCode: 'ABCD1234' });
    assert.equal(req.setupRequired, true);
    assert.equal(req.setupPath, '/account/stripe/link');

    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /path:\s*'\/account\/payouts'/);
    assert.match(stack, /path:\s*'\/account\/stripe\/link'/);
    assert.match(stack, /path:\s*'\/partner\/register'/);

    const index = fs.readFileSync(
      path.join(ROOT, 'entry', 'src', 'index.js'),
      'utf8',
    );
    assert.match(index, /handleAccountPayouts/);
    assert.match(index, /handlePartnerRegister/);
    assert.match(index, /handleWidgetsCreate/);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(pkg.files.includes('partners/'));
  });
});
