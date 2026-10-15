'use strict';

/**
 * FR-229: shared login entry for merchant / partner / club.
 * One session stack; role/intent attached after identity is known.
 * Phase 5: no passwords (FR-225).
 */

const { assertUserId, UserIdError } = require('../identity/userId');

const INTENTS = Object.freeze(['merchant', 'partner', 'club']);

const REDIRECTS = Object.freeze({
  merchant: '/components-piece/merchant-wizard/',
  partner: '/components-piece/partner-register/',
  club: '/components-piece/club-entry/',
});

class LoginEntryError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'LoginEntryError';
    this.code = code;
  }
}

/**
 * @param {unknown} intent
 * @returns {'merchant'|'partner'|'club'}
 */
function assertIntent(intent) {
  const s = String(intent || '')
    .trim()
    .toLowerCase();
  if (!INTENTS.includes(s)) {
    throw new LoginEntryError('invalid_intent', 'intent must be merchant|partner|club');
  }
  return /** @type {'merchant'|'partner'|'club'} */ (s);
}

/**
 * Build a shared session after identity is verified (OAuth / magic / OTP).
 * @param {{
 *   userId: string,
 *   intent?: string,
 *   role?: string,
 *   contact?: string,
 *   email?: string,
 *   phone?: string,
 *   provider?: string,
 * }} claims
 */
function createSharedSession(claims) {
  if (!claims || typeof claims !== 'object') {
    throw new LoginEntryError('claims_required');
  }
  let userId;
  try {
    userId = assertUserId(claims.userId);
  } catch (err) {
    if (err instanceof UserIdError) {
      throw new LoginEntryError('invalid_user_id', err.message);
    }
    throw err;
  }
  const intent = claims.intent != null ? assertIntent(claims.intent) : undefined;
  const role =
    claims.role != null
      ? assertIntent(claims.role)
      : intent;
  const email =
    claims.email != null && String(claims.email).trim()
      ? String(claims.email).trim()
      : undefined;
  const phone =
    claims.phone != null && String(claims.phone).trim()
      ? String(claims.phone).trim()
      : undefined;
  const contact =
    claims.contact != null && String(claims.contact).trim()
      ? String(claims.contact).trim()
      : email || phone || undefined;
  if (!contact) {
    throw new LoginEntryError('contact_required', 'fail closed: need email|phone|contact');
  }
  /** @type {{
   *   userId: string,
   *   contact: string,
   *   stack: 'shared',
   *   role?: string,
   *   intent?: string,
   *   email?: string,
   *   phone?: string,
   *   provider?: string,
   * }} */
  const session = {
    userId,
    contact,
    stack: 'shared',
  };
  if (role) session.role = role;
  if (intent) session.intent = intent;
  if (email) session.email = email;
  if (phone) session.phone = phone;
  if (claims.provider) session.provider = String(claims.provider).trim().toLowerCase();
  return session;
}

/**
 * Post-login redirect by role/intent (role wins when both set).
 * @param {{ intent?: string, role?: string, session?: { intent?: string, role?: string } }} opts
 */
function resolvePostLoginRedirect(opts) {
  const o = opts || {};
  const session = o.session || {};
  const key = assertIntent(o.role || o.intent || session.role || session.intent);
  return REDIRECTS[key];
}

/**
 * Same session object is valid for merchant and partner entry fixtures.
 * @param {object} session
 * @param {'merchant'|'partner'|'club'} intent
 */
function assertSessionForIntent(session, intent) {
  if (!session || session.stack !== 'shared') {
    throw new LoginEntryError('shared_session_required');
  }
  assertUserId(session.userId);
  if (!session.contact) {
    throw new LoginEntryError('contact_required');
  }
  assertIntent(intent);
  return true;
}

/**
 * Fail-when: three divergent auth implementations (password stacks / duplicate mint).
 * @param {string[]} modulePaths relative paths that mint sessions
 */
function assertSingleLoginStack(modulePaths) {
  const paths = Array.isArray(modulePaths) ? modulePaths : [];
  const shared = paths.filter((p) => /shared\/auth\/loginEntry\.js$/.test(String(p).replace(/\\/g, '/')));
  if (shared.length !== 1) {
    throw new LoginEntryError(
      'divergent_auth_stacks',
      'expected exactly one shared/auth/loginEntry.js session mint',
    );
  }
  const banned = paths.filter((p) =>
    /passwordLogin|merchantAuth\.js|partnerAuth\.js|clubAuth\.js/i.test(String(p)),
  );
  if (banned.length > 0) {
    throw new LoginEntryError(
      'divergent_auth_stacks',
      'divergent auth modules: ' + banned.join(','),
    );
  }
  return true;
}

module.exports = {
  INTENTS,
  REDIRECTS,
  LoginEntryError,
  assertIntent,
  createSharedSession,
  resolvePostLoginRedirect,
  assertSessionForIntent,
  assertSingleLoginStack,
};
