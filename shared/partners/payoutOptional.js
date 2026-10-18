'use strict';

/**
 * FR-222: partner/club Stripe payouts optional until payout is requested.
 * No live Stripe calls -- inject createConnectAccount / createAccountLink.
 */

/**
 * @typedef {{
 *   tenantCode: string,
 *   role: 'partner'|'club',
 *   email?: string,
 *   stripePayoutAccountId: string|null,
 *   payoutOptional: boolean,
 *   status: string,
 *   createdAt: number,
 * }} TenantRow
 */

function createTenantRegistry() {
  /** @type {Map<string, TenantRow>} */
  const map = new Map();
  return {
    /**
     * @param {TenantRow} row
     */
    put(row) {
      map.set(row.tenantCode, row);
      return { ...row };
    },
    /**
     * @param {string} tenantCode
     * @returns {TenantRow|undefined}
     */
    get(tenantCode) {
      const row = map.get(String(tenantCode));
      return row ? { ...row } : undefined;
    },
    /**
     * @param {string} tenantCode
     * @param {Partial<TenantRow>} patch
     */
    update(tenantCode, patch) {
      const cur = map.get(String(tenantCode));
      if (!cur) {
        const err = new Error('tenant_not_found');
        err.code = 'tenant_not_found';
        throw err;
      }
      const next = { ...cur, ...patch };
      map.set(cur.tenantCode, next);
      return { ...next };
    },
  };
}

/**
 * Register partner or club without requiring a Stripe payout account.
 * @param {{
 *   registry: ReturnType<typeof createTenantRegistry>,
 *   role: 'partner'|'club',
 *   tenantCode: string,
 *   email?: string,
 *   stripePayoutAccountId?: string|null,
 *   nowMs?: number,
 * }} args
 */
function registerTenant(args) {
  const role = String(args.role || '');
  if (role !== 'partner' && role !== 'club') {
    const err = new Error('invalid_role');
    err.code = 'invalid_role';
    throw err;
  }
  const tenantCode = String(args.tenantCode || '')
    .trim()
    .toUpperCase();
  if (!/^[0-9A-Z]{8}$/.test(tenantCode)) {
    const err = new Error('invalid_tenant_code');
    err.code = 'invalid_tenant_code';
    throw err;
  }
  /** @type {TenantRow} */
  const row = {
    tenantCode,
    role,
    email: args.email ? String(args.email) : undefined,
    stripePayoutAccountId:
      args.stripePayoutAccountId != null && args.stripePayoutAccountId !== ''
        ? String(args.stripePayoutAccountId)
        : null,
    payoutOptional: true,
    status: 'active',
    createdAt: args.nowMs != null ? Number(args.nowMs) : Date.now(),
  };
  return args.registry.put(row);
}

/**
 * Request a payout. Without a Connect account => setup path (not an error force).
 * @param {{ registry: ReturnType<typeof createTenantRegistry>, tenantCode: string }} args
 */
function requestPayout(args) {
  const row = args.registry.get(args.tenantCode);
  if (!row) {
    const err = new Error('tenant_not_found');
    err.code = 'tenant_not_found';
    throw err;
  }
  if (!row.stripePayoutAccountId) {
    return {
      ok: false,
      setupRequired: true,
      setupPath: '/account/stripe/link',
      tenantCode: row.tenantCode,
      role: row.role,
    };
  }
  return {
    ok: true,
    setupRequired: false,
    stripePayoutAccountId: row.stripePayoutAccountId,
    tenantCode: row.tenantCode,
    role: row.role,
  };
}

/**
 * Start Stripe Connect payout setup when the tenant asks to be paid.
 * @param {{
 *   registry: ReturnType<typeof createTenantRegistry>,
 *   tenantCode: string,
 *   createConnectAccount: () => Promise<{ id: string }>,
 *   createAccountLink: (accountId: string) => Promise<{ url: string }>,
 * }} args
 */
async function startPayoutSetup(args) {
  const row = args.registry.get(args.tenantCode);
  if (!row) {
    const err = new Error('tenant_not_found');
    err.code = 'tenant_not_found';
    throw err;
  }
  if (row.stripePayoutAccountId) {
    const link = await args.createAccountLink(row.stripePayoutAccountId);
    return {
      stripePayoutAccountId: row.stripePayoutAccountId,
      setupUrl: String(link.url),
      alreadyLinked: true,
    };
  }
  const account = await args.createConnectAccount();
  const id = String(account.id);
  // Never log secrets; store account id only (not keys).
  args.registry.update(row.tenantCode, { stripePayoutAccountId: id });
  const link = await args.createAccountLink(id);
  return {
    stripePayoutAccountId: id,
    setupUrl: String(link.url),
    alreadyLinked: false,
  };
}

module.exports = {
  createTenantRegistry,
  registerTenant,
  requestPayout,
  startPayoutSetup,
};
