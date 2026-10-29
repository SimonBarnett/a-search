'use strict';

/**
 * Madeira-compatible userid mint (FR #3968).
 * 7 random chars from [0-9A-Z], then checksum CHARSET[sum(indexOf) % 36].
 * Matches madeira-api-gateway nodejs/auth-utils.js (not shared/partners/register.js).
 */

const crypto = require('node:crypto');
const { assertUserId, isValidUserId } = require('./userId');

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_UNIQUE_ATTEMPTS = 25;

/**
 * @param {string} seven
 * @returns {string} one checksum character
 */
function checksumChar(seven) {
  const s = String(seven);
  if (s.length !== 7) {
    const err = new Error('checksum_needs_seven');
    err.code = 'checksum_needs_seven';
    throw err;
  }
  let sum = 0;
  for (let i = 0; i < 7; i += 1) {
    const idx = CHARSET.indexOf(s[i]);
    if (idx < 0) {
      const err = new Error('checksum_invalid_char');
      err.code = 'checksum_invalid_char';
      throw err;
    }
    sum += idx;
  }
  return CHARSET[sum % 36];
}

/**
 * @param {string} userid
 * @returns {boolean}
 */
function isChecksumValid(userid) {
  if (!isValidUserId(userid)) return false;
  return userid[7] === checksumChar(userid.slice(0, 7));
}

/**
 * @param {{ randomBytes?: (n: number) => Buffer }} [opts]
 * @returns {string} 8-char checksummed userid
 */
function mintChecksummedUserId(opts = {}) {
  const rb = opts.randomBytes || crypto.randomBytes.bind(crypto);
  const bytes = rb(7);
  let seven = '';
  for (let i = 0; i < 7; i += 1) {
    seven += CHARSET[bytes[i] % CHARSET.length];
  }
  return seven + checksumChar(seven);
}

/**
 * Mint a userid unique against an async isTaken check (S3 _userids/ keys).
 * @param {{
 *   mint?: () => string,
 *   isTaken?: (id: string) => Promise<boolean>|boolean,
 *   claim?: (id: string) => Promise<boolean>|boolean,
 *   maxAttempts?: number,
 * }} [opts]
 * @returns {Promise<string>}
 */
async function mintUniqueUserId(opts = {}) {
  const mint = opts.mint || (() => mintChecksummedUserId());
  const maxAttempts =
    opts.maxAttempts != null ? Number(opts.maxAttempts) : MAX_UNIQUE_ATTEMPTS;
  const claim =
    opts.claim ||
    (async (id) => {
      if (typeof opts.isTaken === 'function' && (await opts.isTaken(id))) {
        return false;
      }
      return true;
    });

  for (let i = 0; i < maxAttempts; i += 1) {
    const id = assertUserId(String(mint()).trim().toUpperCase());
    if (!isChecksumValid(id)) {
      const err = new Error('mint_bad_checksum');
      err.code = 'mint_bad_checksum';
      throw err;
    }
    if (await claim(id)) return id;
  }
  const err = new Error('mint_exhausted');
  err.code = 'mint_exhausted';
  throw err;
}

module.exports = {
  CHARSET,
  MAX_UNIQUE_ATTEMPTS,
  checksumChar,
  isChecksumValid,
  mintChecksummedUserId,
  mintUniqueUserId,
};
