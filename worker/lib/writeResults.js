'use strict';

/**
 * Shared worker results writer (FR-009).
 * PutObject to S3_RESULTS_BUCKET at the canonical results key.
 */

const { resultsKey, ResultsPathError } = require('./resultsPath');

/**
 * @param {{
 *   env: string,
 *   source: string,
 *   userId: string|number,
 *   catalogId: string|number,
 *   searchId: string,
 *   products?: unknown[],
 *   envVars?: Record<string, string|undefined>,
 *   putObject?: (args: {
 *     Bucket: string,
 *     Key: string,
 *     Body: string,
 *     ContentType: string,
 *   }) => Promise<unknown>,
 * }} opts
 * @returns {Promise<{ bucket: string, key: string, body: object }>}
 */
async function writeResults(opts) {
  const envVars = opts.envVars || process.env;
  const bucket =
    envVars.S3_RESULTS_BUCKET != null
      ? String(envVars.S3_RESULTS_BUCKET).trim()
      : '';
  if (!bucket) {
    throw new Error('S3_RESULTS_BUCKET is required');
  }

  const key = resultsKey({
    env: opts.env,
    source: opts.source,
    userId: opts.userId,
    catalogId: opts.catalogId,
    searchId: opts.searchId,
  });

  const body = {
    searchId: String(opts.searchId).trim(),
    source: String(opts.source).trim(),
    userId: String(opts.userId).trim(),
    products: Array.isArray(opts.products) ? opts.products : [],
  };

  const putObject =
    opts.putObject ||
    (async () => {
      throw new Error(
        'putObject not configured — inject AWS S3 PutObject for deploy',
      );
    });

  const payload = JSON.stringify(body);
  await putObject({
    Bucket: bucket,
    Key: key,
    Body: payload,
    ContentType: 'application/json',
  });

  return { bucket, key, body };
}

module.exports = { writeResults, ResultsPathError };
