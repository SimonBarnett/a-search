'use strict';

/**
 * FR-249 / #1363: monthly club commission budget split pro rata by merchant-part clicks.
 * Pure compute + injectable memory store. a_search DB tables only (never madeiradb).
 */

class RevenueShareError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'RevenueShareError';
    this.code = code;
  }
}

const RULE_VERSION = 'fr249-budget-clicks-v1';

/**
 * Eligible click row from FR-234 aggregates (already bot-filtered).
 * @typedef {{ clubId: string, clicks: number, partClass?: string, class?: string, source?: string }} ClickAgg
 */

/**
 * @param {ClickAgg[]} rows
 * @returns {Map<string, number>}
 */
function merchantClicksByClub(rows) {
  /** @type {Map<string, number>} */
  const byClub = new Map();
  for (const row of rows || []) {
    if (!row || typeof row !== 'object') continue;
    const partClass = String(row.partClass || row.class || '')
      .trim()
      .toLowerCase();
    if (partClass && partClass !== 'merchant') continue;
    const clubId = String(row.clubId || '')
      .trim()
      .toUpperCase();
    if (!clubId) continue;
    const n = Math.max(0, Math.floor(Number(row.clicks) || 0));
    if (n === 0) continue;
    byClub.set(clubId, (byClub.get(clubId) || 0) + n);
  }
  return byClub;
}

/**
 * Floor-to-penny pro rata; remainder unallocated.
 * @param {number} budgetMinor
 * @param {Map<string, number>} clicksByClub
 * @returns {{ shares: { clubId: string, clicks: number, amountMinor: number }[], totalClicks: number, allocatedMinor: number, remainderMinor: number }}
 */
function splitBudgetByClicks(budgetMinor, clicksByClub) {
  const budget = Math.max(0, Math.floor(Number(budgetMinor) || 0));
  const entries = [...clicksByClub.entries()]
    .map(([clubId, clicks]) => ({ clubId, clicks: Math.floor(clicks) }))
    .filter((e) => e.clicks > 0)
    .sort((a, b) => a.clubId.localeCompare(b.clubId));
  const totalClicks = entries.reduce((s, e) => s + e.clicks, 0);
  if (budget === 0 || totalClicks === 0) {
    return {
      shares: entries.map((e) => ({
        clubId: e.clubId,
        clicks: e.clicks,
        amountMinor: 0,
      })),
      totalClicks,
      allocatedMinor: 0,
      remainderMinor: budget,
    };
  }
  const shares = entries.map((e) => ({
    clubId: e.clubId,
    clicks: e.clicks,
    amountMinor: Math.floor((budget * e.clicks) / totalClicks),
  }));
  const allocatedMinor = shares.reduce((s, e) => s + e.amountMinor, 0);
  return {
    shares,
    totalClicks,
    allocatedMinor,
    remainderMinor: budget - allocatedMinor,
  };
}

/**
 * In-memory store mirroring a_search.dbo ClubPoolBudget / RevenueSharePeriods / ClubRevenueShares.
 */
function createRevenueShareStore() {
  /** @type {Map<string, { periodId: string, amountMinor: number, setBy: string, setAt: string, note: string|null }>} */
  const budgets = new Map();
  /** @type {Map<string, object>} */
  const periods = new Map();
  /** @type {Map<string, object[]>} */
  const clubShares = new Map();

  return {
    setBudget(periodId, amountMinor, setBy, note) {
      const id = String(periodId || '').trim();
      if (!/^\d{4}-\d{2}$/.test(id)) {
        throw new RevenueShareError('invalid_period', 'periodId must be YYYY-MM');
      }
      const amount = Math.floor(Number(amountMinor));
      if (!Number.isFinite(amount) || amount < 0) {
        throw new RevenueShareError('invalid_budget', 'amountMinor must be >= 0');
      }
      budgets.set(id, {
        periodId: id,
        amountMinor: amount,
        setBy: String(setBy || 'admin'),
        setAt: new Date().toISOString(),
        note: note == null ? null : String(note),
      });
      return budgets.get(id);
    },
    getBudget(periodId) {
      return budgets.get(String(periodId || '').trim()) || null;
    },
    getPeriod(periodId) {
      return periods.get(String(periodId || '').trim()) || null;
    },
    listClubShares(periodId) {
      return clubShares.get(String(periodId || '').trim()) || [];
    },
    getClubShare(periodId, clubId) {
      const id = String(periodId || '').trim();
      const c = String(clubId || '')
        .trim()
        .toUpperCase();
      return (clubShares.get(id) || []).find((r) => r.clubId === c) || null;
    },
    /**
     * @param {{
     *   periodId: string,
     *   clickRows: ClickAgg[],
     *   closedAt?: string,
     *   inputsChecksum?: string,
     * }} args
     */
    closePeriod(args) {
      const periodId = String(args.periodId || '').trim();
      if (!/^\d{4}-\d{2}$/.test(periodId)) {
        throw new RevenueShareError('invalid_period', 'periodId must be YYYY-MM');
      }
      const existing = periods.get(periodId);
      if (existing && existing.status === 'closed') {
        return {
          noop: true,
          period: existing,
          shares: clubShares.get(periodId) || [],
        };
      }
      const budget = budgets.get(periodId);
      if (!budget) {
        throw new RevenueShareError(
          'budget_unset',
          `ClubPoolBudget unset for ${periodId}`,
        );
      }
      const filtered = (args.clickRows || []).filter((r) => {
        const src = String((r && (r.source || r.product || '')) || '')
          .trim()
          .toLowerCase();
        if (src === 'widget_upgrade') return false;
        return true;
      });
      const byClub = merchantClicksByClub(filtered);
      const split = splitBudgetByClicks(budget.amountMinor, byClub);
      const closedAt = args.closedAt || new Date().toISOString();
      const configJson = JSON.stringify({
        ruleVersion: RULE_VERSION,
        split: 'clicks_only',
        budgetSource: 'ClubPoolBudget',
        widgetUpgrade: 'excluded',
      });
      const period = {
        periodId,
        status: 'closed',
        budgetMinor: budget.amountMinor,
        poolMinor: budget.amountMinor,
        allocatedMinor: split.allocatedMinor,
        remainderMinor: split.remainderMinor,
        totalClicks: split.totalClicks,
        rollOutMinor: split.totalClicks === 0 ? budget.amountMinor : 0,
        ruleVersion: RULE_VERSION,
        configJson,
        inputsChecksum: String(args.inputsChecksum || ''),
        closedAt,
      };
      const shares = split.shares.map((s) => ({
        periodId,
        clubId: s.clubId,
        clicks: s.clicks,
        impressions: 0,
        score: split.totalClicks ? s.clicks / split.totalClicks : 0,
        amountMinor: s.amountMinor,
        flagged: false,
      }));
      periods.set(periodId, period);
      clubShares.set(periodId, shares);
      return { noop: false, period, shares };
    },
  };
}

module.exports = {
  RULE_VERSION,
  RevenueShareError,
  merchantClicksByClub,
  splitBudgetByClicks,
  createRevenueShareStore,
};
