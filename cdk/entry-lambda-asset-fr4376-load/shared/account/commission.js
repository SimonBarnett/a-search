'use strict';

/**
 * #1344: GET /account/commission -- unclaimed commission for JWT user.
 * Reads injectable store (click/commission records); no madeiradb writes.
 */

/**
 * @returns {{
 *   getUnclaimed: (userId: string) => { unclaimedMinor: number, currency: string },
 *   setUnclaimed: (userId: string, unclaimedMinor: number, currency?: string) => void,
 * }}
 */
function createCommissionStore() {
  /** @type {Map<string, { unclaimedMinor: number, currency: string }>} */
  const byUser = new Map();
  return {
    getUnclaimed(userId) {
      const key = String(userId || '')
        .trim()
        .toUpperCase();
      return (
        byUser.get(key) || {
          unclaimedMinor: 0,
          currency: 'GBP',
        }
      );
    },
    setUnclaimed(userId, unclaimedMinor, currency) {
      const key = String(userId || '')
        .trim()
        .toUpperCase();
      byUser.set(key, {
        unclaimedMinor: Number(unclaimedMinor) || 0,
        currency: String(currency || 'GBP'),
      });
    },
  };
}

module.exports = {
  createCommissionStore,
};
