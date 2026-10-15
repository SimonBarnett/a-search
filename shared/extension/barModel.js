'use strict';

/**
 * #2078: logged-in top-bar action model (commission chip, Stripe, Claim club-only, Upgrade, Create).
 */

/**
 * @param {{ unclaimedMinor?: number, currency?: string }} commission
 */
function formatCommissionChip(commission) {
  const c = commission || {};
  const minor = Number(c.unclaimedMinor);
  const currency = String(c.currency || 'GBP').toUpperCase();
  const safe = Number.isFinite(minor) ? minor : 0;
  const major = (safe / 100).toFixed(2);
  return `${currency} ${major}`;
}

/**
 * @param {{
 *   loggedIn: boolean,
 *   role?: string|null,
 *   commission?: { unclaimedMinor?: number, currency?: string }|null,
 * }} state
 * @returns {{ id: string, label: string, action: string }[]}
 */
function buildBarActions(state) {
  const s = state || {};
  if (!s.loggedIn) {
    return [{ id: 'login', label: 'Login', action: 'login' }];
  }
  /** @type {{ id: string, label: string, action: string }[]} */
  const actions = [
    {
      id: 'commission',
      label: formatCommissionChip(s.commission || {}),
      action: 'commission',
    },
    { id: 'stripe', label: 'Stripe', action: 'stripe' },
  ];
  const role = String(s.role || '')
    .trim()
    .toLowerCase();
  if (role === 'club') {
    actions.push({ id: 'claim', label: 'Claim', action: 'claim' });
  }
  actions.push(
    { id: 'upgrade', label: 'Upgrade', action: 'upgrade' },
    { id: 'create', label: 'Create widget', action: 'create' },
    { id: 'logout', label: 'Logout', action: 'logout' },
  );
  return actions;
}

module.exports = {
  formatCommissionChip,
  buildBarActions,
};
