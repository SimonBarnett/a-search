'use strict';

/**
 * Signup events reader for the daily report job (FR-052c).
 * Lists signups for env/source/day from the LOCKED S3 JSON store.
 * Mailer / HTML email is out of scope.
 */

const { dayStamp, SignupsPathError } = require('./signupsPath');
const { readSignupEvents } = require('./writeSignups');

/**
 * @param {object} row
 * @param {{ env: string, source: string, day: string }} want
 * @returns {boolean}
 */
function matchesEnvSourceDay(row, want) {
  if (!row || typeof row !== 'object') return false;
  if (row.env != null && String(row.env).trim() !== want.env) {
    return false;
  }
  if (row.source != null && String(row.source).trim() !== want.source) {
    return false;
  }
  const ts = row.onboardedAt || row.signedUpAt;
  if (ts != null && String(ts).trim() !== '') {
    try {
      if (dayStamp(ts) !== want.day) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * List signup events for one env + source + calendar day.
 * Returns only rows that match env/day (and source when set on the row).
 *
 * @param {object} opts
 * @param {string} opts.env - live|sandbox
 * @param {string} opts.source - registry id
 * @param {string|Date} [opts.day] - yyyy-MM-dd (UTC); default today
 * @param {Record<string, string|undefined>} [opts.envVars]
 * @param {Function} [opts.getObject]
 * @returns {Promise<{
 *   env: string,
 *   source: string,
 *   day: string,
 *   signups: object[],
 *   key: string,
 * }>}
 */
async function listSignupEvents(opts = {}) {
  const env = opts.env;
  if (env !== 'live' && env !== 'sandbox') {
    throw new SignupsPathError('invalid_env', 'env must be live|sandbox');
  }
  const source = opts.source == null ? '' : String(opts.source).trim();
  if (!source) {
    throw new SignupsPathError('empty_source', 'source is required');
  }
  const day = dayStamp(opts.day);

  const doc = await readSignupEvents({
    env,
    source,
    day,
    envVars: opts.envVars,
    getObject: opts.getObject,
    createS3Client: opts.createS3Client,
  });

  const want = { env, source, day };
  const signups = (Array.isArray(doc.signups) ? doc.signups : []).filter(
    (row) => matchesEnvSourceDay(row, want),
  );

  const { signupsKey } = require('./signupsPath');
  return {
    env,
    source,
    day,
    signups,
    key: signupsKey({ env, source, day }),
  };
}

module.exports = {
  listSignupEvents,
  matchesEnvSourceDay,
};
