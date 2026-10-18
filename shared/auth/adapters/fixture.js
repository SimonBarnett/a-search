'use strict';

/**
 * FR-227: fixture OAuth adapter scaffold (stay-dark until real credentials).
 * Live token exchange is out of scope -- inject profile claims in tests.
 */

const { AuthContactError } = require('../registry');

/**
 * @param {string} providerId
 * @returns {{ exchange: (ctx: object) => Promise<object> }}
 */
function createFixtureAdapter(providerId) {
  const provider = String(providerId || '')
    .trim()
    .toLowerCase();
  if (!provider) {
    throw new Error('provider_id_required');
  }

  return {
    /**
     * @param {{
     *   code?: string,
     *   profile?: {
     *     email?: string,
     *     phone?: string,
     *     contact?: string,
     *     subject?: string,
     *   },
     * }} ctx
     */
    async exchange(ctx) {
      const profile = (ctx && ctx.profile) || {};
      const subject = String(profile.subject || `${provider}-fixture`).trim();
      const email =
        profile.email != null && String(profile.email).trim()
          ? String(profile.email).trim()
          : undefined;
      const phone =
        profile.phone != null && String(profile.phone).trim()
          ? String(profile.phone).trim()
          : undefined;
      const contact =
        profile.contact != null && String(profile.contact).trim()
          ? String(profile.contact).trim()
          : undefined;
      if (!email && !phone && !contact) {
        throw new AuthContactError('contact_required');
      }
      /** @type {{ provider: string, subject: string, email?: string, phone?: string, contact?: string }} */
      const out = { provider, subject };
      if (email) out.email = email;
      if (phone) out.phone = phone;
      if (contact) out.contact = contact;
      return out;
    },
  };
}

module.exports = { createFixtureAdapter };
