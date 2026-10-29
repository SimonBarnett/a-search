'use strict';

/**
 * S3 key for daily signup events (FR-052b LOCKED store).
 * Key: {env}/_reports/{source}/{yyyy-MM-dd}/signups.json
 */

class SignupsPathError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'SignupsPathError';
    this.code = code;
  }
}

/**
 * @param {string|Date} [day]
 * @returns {string} yyyy-MM-dd (UTC)
 */
function dayStamp(day) {
  if (day == null || day === '') {
    return new Date().toISOString().slice(0, 10);
  }
  if (day instanceof Date) {
    return day.toISOString().slice(0, 10);
  }
  const s = String(day).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new SignupsPathError(
      'invalid_day',
      'day must be yyyy-MM-dd or parseable date',
    );
  }
  return d.toISOString().slice(0, 10);
}

/**
 * @param {{ env: string, source: string, day?: string|Date }} parts
 * @returns {string}
 */
function signupsKey(parts = {}) {
  const env = parts.env;
  if (env !== 'live' && env !== 'sandbox') {
    throw new SignupsPathError('invalid_env', 'env must be live|sandbox');
  }
  const source = parts.source == null ? '' : String(parts.source).trim();
  if (!source) {
    throw new SignupsPathError('empty_source', 'source is required');
  }
  const day = dayStamp(parts.day);
  return `${env}/_reports/${source}/${day}/signups.json`;
}

module.exports = {
  signupsKey,
  dayStamp,
  SignupsPathError,
};
