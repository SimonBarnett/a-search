'use strict';

/**
 * FR-218: partner registration -- mint DNS partner code + instructions.
 * Production mint should call dbo.GenerateUniqueUserId (inject); checksum is
 * not re-implemented here (docs/identity.md).
 */

const crypto = require('node:crypto');
const { assertUserId, USER_ID_RE } = require('../identity/userId');

const INSTRUCTIONS_URL = 'https://smartcatalogue.uk/partners';
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Default fixture-safe mint: 8 random chars from [0-9A-Z].
 * Prefer injecting GenerateUniqueUserId in production.
 * @returns {string}
 */
function defaultMint() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += CHARSET[bytes[i] % CHARSET.length];
  }
  return out;
}

/**
 * @param {{
 *   mint?: () => Promise<string>|string,
 *   isTaken?: (code: string) => Promise<boolean>|boolean,
 *   maxAttempts?: number,
 * }} [opts]
 * @returns {Promise<string>}
 */
async function mintPartnerCode(opts = {}) {
  const mint = opts.mint || defaultMint;
  const isTaken = opts.isTaken || (async () => false);
  const maxAttempts = opts.maxAttempts != null ? Number(opts.maxAttempts) : 8;
  for (let i = 0; i < maxAttempts; i += 1) {
    const raw = await mint();
    const code = assertUserId(String(raw).trim().toUpperCase());
    if (!(await isTaken(code))) return code;
  }
  const err = new Error('mint_exhausted');
  err.code = 'mint_exhausted';
  throw err;
}

/**
 * @param {{ partnerCode: string, email?: string }} args
 */
function buildPartnerRegisterResponse(args) {
  const partnerCode = assertUserId(args.partnerCode);
  const instructions =
    'Add a Partner TXT DNS record with value ' +
    partnerCode +
    '. Full steps: ' +
    INSTRUCTIONS_URL +
    ' (also enables the Chrome extension on that host via GET /ext/status). ' +
    'Club TXT (club id) is still required on the host for click approval.';
  return {
    ok: true,
    partnerCode,
    instructionsUrl: INSTRUCTIONS_URL,
    instructions,
    email: args.email ? String(args.email) : undefined,
  };
}

module.exports = {
  USER_ID_RE,
  INSTRUCTIONS_URL,
  mintPartnerCode,
  buildPartnerRegisterResponse,
  defaultMint,
};
