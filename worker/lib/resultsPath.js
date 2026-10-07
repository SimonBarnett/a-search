'use strict';

/**
 * Canonical results object key + S3 / rclone paths (FR-008).
 * Key: {env}/{source}/{userId}/{catalogId}/{searchId}.json
 */

const path = require('node:path');

class ResultsPathError extends Error {
  /**
   * @param {'empty_userId'|'empty_searchId'|'empty_source'|'invalid_env'|'empty_bucket'|'empty_root'} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'ResultsPathError';
    this.code = code;
  }
}

/**
 * @param {{
 *   env: string,
 *   source: string,
 *   userId: string|number,
 *   catalogId: string|number,
 *   searchId: string,
 * }} parts
 */
function normalizeParts(parts) {
  if (!parts || typeof parts !== 'object') {
    throw new ResultsPathError('invalid_env', 'parts required');
  }
  const env = parts.env;
  if (env !== 'live' && env !== 'sandbox') {
    throw new ResultsPathError('invalid_env');
  }
  const source = parts.source == null ? '' : String(parts.source).trim();
  if (!source) throw new ResultsPathError('empty_source');
  const userId = parts.userId == null ? '' : String(parts.userId).trim();
  if (!userId) throw new ResultsPathError('empty_userId');
  const searchId = parts.searchId == null ? '' : String(parts.searchId).trim();
  if (!searchId) throw new ResultsPathError('empty_searchId');
  if (parts.catalogId === undefined || parts.catalogId === null || parts.catalogId === '') {
    throw new ResultsPathError('empty_catalogId');
  }
  const catalogId = String(parts.catalogId).trim();
  return { env, source, userId, catalogId, searchId };
}

/**
 * Logical object key (forward slashes, no leading slash).
 * @returns {string}
 */
function resultsKey(parts) {
  const p = normalizeParts(parts);
  return `${p.env}/${p.source}/${p.userId}/${p.catalogId}/${p.searchId}.json`;
}

/**
 * @param {{ bucket: string } & object} opts
 * @returns {string} s3://bucket/key
 */
function resultsS3Uri(opts) {
  const bucket = opts && opts.bucket != null ? String(opts.bucket).trim() : '';
  if (!bucket) throw new ResultsPathError('empty_bucket');
  const key = resultsKey(opts);
  return `s3://${bucket}/${key}`;
}

/**
 * Path under rclone mount root (OS-native separators).
 * @param {{ root?: string } & object} opts - root defaults to process.env.A_SEARCH_RCLONE_ROOT
 * @returns {string}
 */
function resultsRclonePath(opts) {
  const rootRaw =
    opts && opts.root != null ? opts.root : process.env.A_SEARCH_RCLONE_ROOT;
  const root = rootRaw != null ? String(rootRaw).trim() : '';
  if (!root) throw new ResultsPathError('empty_root');
  const p = normalizeParts(opts);
  return path.join(
    root,
    p.env,
    p.source,
    p.userId,
    p.catalogId,
    `${p.searchId}.json`,
  );
}

module.exports = {
  resultsKey,
  resultsS3Uri,
  resultsRclonePath,
  ResultsPathError,
};
