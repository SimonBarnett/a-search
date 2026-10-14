'use strict';

/**
 * FR-200: dual DNS TXT gate + cache helper.
 * Club TXT required for approval / extension enable; Partner TXT optional.
 * Partner alone never unlocks destinations or enables the extension.
 *
 * LOCKED TXT value prefixes on the host apex (dns.resolveTxt(host)):
 *   a-search-club=<clubId>
 *   a-search-partner=<partnerId>
 */

const dns = require('node:dns').promises;
const {
  ensureCustomer,
  getCustomerByHost,
  updateCustomer,
  normalizeHost,
} = require('../components/customers');

const CLUB_PREFIX = 'a-search-club=';
const PARTNER_PREFIX = 'a-search-partner=';
const DEFAULT_NEG_TTL_S = 600;

/**
 * @param {string[][]} records resolveTxt result
 * @returns {{ clubId: string|null, partnerId: string|null }}
 */
function parseTxtRecords(records) {
  let clubId = null;
  let partnerId = null;
  const rows = Array.isArray(records) ? records : [];
  for (const chunks of rows) {
    const line = Array.isArray(chunks) ? chunks.join('') : String(chunks || '');
    const parts = line.split(/\s+/);
    for (const token of parts.length ? parts : [line]) {
      const t = String(token || '').trim();
      if (!t) continue;
      const lower = t.toLowerCase();
      if (lower.startsWith(CLUB_PREFIX)) {
        const v = t.slice(CLUB_PREFIX.length).trim();
        if (v) clubId = v;
      } else if (lower.startsWith(PARTNER_PREFIX)) {
        const v = t.slice(PARTNER_PREFIX.length).trim();
        if (v) partnerId = v;
      }
    }
  }
  return { clubId, partnerId };
}

/**
 * @param {object|null} customer
 * @param {number} nowMs
 * @param {number} negTtlS
 * @returns {boolean}
 */
function cacheFresh(customer, nowMs, negTtlS) {
  if (!customer || !customer.dnsCheckedAt) return false;
  const checked = Date.parse(String(customer.dnsCheckedAt));
  if (!Number.isFinite(checked)) return false;
  if (customer.approved && customer.clubId) return true;
  // Negative cache: Club absent
  return nowMs - checked < negTtlS * 1000;
}

/**
 * Lookup Club/Partner TXT for host; persist approval cache on Customers.
 * @param {{
 *   host: string,
 *   store: object,
 *   resolveTxt?: (host: string) => Promise<string[][]>,
 *   now?: () => Date,
 *   negTtlS?: number,
 *   force?: boolean,
 * }} opts
 * @returns {Promise<{
 *   clubId: string|null,
 *   partnerId: string|null,
 *   checkedAt: string,
 *   fromCache: boolean,
 *   approved: boolean,
 *   dnsCalls: number,
 * }>}
 */
async function hostTxtStatus(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('hostTxtStatus opts required');
  }
  if (!opts.store) throw new Error('store_required');
  const host = normalizeHost(opts.host);
  const negTtlS =
    opts.negTtlS != null && Number(opts.negTtlS) >= 0
      ? Number(opts.negTtlS)
      : DEFAULT_NEG_TTL_S;
  const nowFn = typeof opts.now === 'function' ? opts.now : () => new Date();
  const nowDate = nowFn();
  const nowMs = nowDate.getTime();
  const checkedAt = nowDate.toISOString();

  ensureCustomer(opts.store, { host });
  let customer = getCustomerByHost(opts.store, host);

  if (!opts.force && cacheFresh(customer, nowMs, negTtlS)) {
    return {
      clubId: customer.clubId || null,
      partnerId: customer.partnerId || null,
      checkedAt: String(customer.dnsCheckedAt),
      fromCache: true,
      approved: !!customer.approved && !!customer.clubId,
      dnsCalls: 0,
    };
  }

  const resolveTxt =
    typeof opts.resolveTxt === 'function'
      ? opts.resolveTxt
      : (h) => dns.resolveTxt(h);

  let records = [];
  try {
    records = await resolveTxt(host);
  } catch (err) {
    const code = err && err.code ? String(err.code) : '';
    // ENOTFOUND / ENODATA => treat as no TXT
    if (code !== 'ENOTFOUND' && code !== 'ENODATA' && code !== 'ETIMEOUT') {
      // Still treat as absent for gate purposes; callers may log.
      records = [];
    } else {
      records = [];
    }
  }

  const parsed = parseTxtRecords(records);
  const clubId = parsed.clubId;
  const partnerId = clubId ? parsed.partnerId : null; // partner only with club (Simon)
  const approved = !!clubId;

  customer = updateCustomer(opts.store, host, {
    approved,
    clubId: clubId || null,
    partnerId: partnerId || null,
    dnsCheckedAt: checkedAt,
  });

  return {
    clubId: customer.clubId || null,
    partnerId: customer.partnerId || null,
    checkedAt,
    fromCache: false,
    approved: !!customer.approved && !!customer.clubId,
    dnsCalls: 1,
  };
}

/**
 * Extension gate: enabled only when Club TXT present (cached).
 * @param {object} opts same as hostTxtStatus
 */
async function extStatus(opts) {
  const status = await hostTxtStatus(opts);
  return {
    enabled: !!status.clubId,
    clubId: status.clubId,
    partnerId: status.partnerId,
    checkedAt: status.checkedAt,
    fromCache: status.fromCache,
    dnsCalls: status.dnsCalls,
  };
}

module.exports = {
  hostTxtStatus,
  extStatus,
  parseTxtRecords,
  cacheFresh,
  CLUB_PREFIX,
  PARTNER_PREFIX,
  DEFAULT_NEG_TTL_S,
};
