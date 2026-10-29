'use strict';

/**
 * FR-231: OAuth callback completion -- fail closed without email|phone|contact.
 * Never mint identity / Users|Partner rows when contact claims are missing.
 */

const {
  AuthContactError,
  getAuthAdapter,
  acceptAuthResult,
} = require('./registry');
const {
  createSharedSession,
  LoginEntryError,
} = require('./loginEntry');

/** Stable wire code for AL3 "Provider returned no contact". */
const OAUTH_NO_CONTACT_CODE = 'contact_required';

/** User-facing AL3 title (docs/mocks/components-piece-auth/error.html). */
const OAUTH_NO_CONTACT_MESSAGE = 'Provider returned no contact';

/** AL3 detail copy. */
const OAUTH_NO_CONTACT_DETAIL =
  'That login did not include email, phone, or contact. Choose another provider or use email OTP.';

/**
 * @returns {{
 *   ok: false,
 *   error: string,
 *   message: string,
 *   detail: string,
 *   al: 'AL3',
 * }}
 */
function rejectNoContact() {
  return {
    ok: false,
    error: OAUTH_NO_CONTACT_CODE,
    message: OAUTH_NO_CONTACT_MESSAGE,
    detail: OAUTH_NO_CONTACT_DETAIL,
    al: 'AL3',
  };
}

/**
 * Complete an OAuth login via registered adapter.
 * On missing contact: return AL3 reject and never call createIdentityRow.
 *
 * @param {{
 *   provider: string,
 *   code?: string,
 *   profile?: object,
 *   intent?: string,
 *   role?: string,
 * }} input
 * @param {{
 *   createIdentityRow?: (claims: object) => Promise<{ userId: string }>|{ userId: string },
 * }} [deps]
 */
async function completeOAuthLogin(input, deps) {
  const d = deps || {};
  const provider = String((input && input.provider) || '')
    .trim()
    .toLowerCase();
  if (!provider) {
    return {
      ok: false,
      error: 'provider_required',
      message: 'provider_required',
    };
  }

  let adapter;
  try {
    adapter = getAuthAdapter(provider);
  } catch (err) {
    return {
      ok: false,
      error: (err && err.code) || 'unknown_auth_provider',
      message: (err && err.message) || 'unknown_auth_provider',
    };
  }

  let raw;
  try {
    raw = await adapter.exchange({
      code: input.code,
      profile: input.profile || {},
    });
  } catch (err) {
    if (err instanceof AuthContactError) {
      return rejectNoContact();
    }
    throw err;
  }

  let claims;
  try {
    claims = acceptAuthResult(raw);
  } catch (err) {
    if (err instanceof AuthContactError) {
      return rejectNoContact();
    }
    throw err;
  }

  const createIdentity =
    typeof d.createIdentityRow === 'function'
      ? d.createIdentityRow
      : async () => {
          throw new Error('createIdentityRow_required');
        };

  const identity = await createIdentity(claims);
  const userId = identity && identity.userId;
  if (!userId) {
    return {
      ok: false,
      error: 'identity_mint_failed',
      message: 'identity_mint_failed',
    };
  }

  try {
    const session = createSharedSession({
      userId,
      intent: input.intent,
      role: input.role,
      email: claims.email,
      phone: claims.phone,
      contact: claims.contact,
      provider: claims.provider,
    });
    return {
      ok: true,
      session,
      userId: session.userId,
      claims,
    };
  } catch (err) {
    if (err instanceof LoginEntryError && err.code === 'contact_required') {
      return rejectNoContact();
    }
    throw err;
  }
}

module.exports = {
  OAUTH_NO_CONTACT_CODE,
  OAUTH_NO_CONTACT_MESSAGE,
  OAUTH_NO_CONTACT_DETAIL,
  rejectNoContact,
  completeOAuthLogin,
};
