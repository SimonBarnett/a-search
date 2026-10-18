'use strict';

/**
 * FR-3951: a-clubs result path (Simon 2026-10-18).
 * Key: {host}/{guid}/IN/{searchId}.json --- no HOSTS/ prefix.
 */

const path = require('node:path');

class AClubsPathError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'AClubsPathError';
    this.code = code;
  }
}

/**
 * @param {unknown} value
 * @param {string} code
 * @returns {string}
 */
function requireToken(value, code) {
  const s = value == null ? '' : String(value).trim();
  if (!s) throw new AClubsPathError(code);
  if (s.includes('..') || s.includes('/') || s.includes('\\')) {
    throw new AClubsPathError(code, `${code}: path segment`);
  }
  return s;
}

/**
 * Logical object key under the a-clubs bucket (forward slashes).
 * @param {{ host: string, guid: string, searchId: string }} parts
 * @returns {string}
 */
function aClubsInKey(parts) {
  const host = requireToken(parts && parts.host, 'empty_host');
  const guid = requireToken(parts && parts.guid, 'empty_guid');
  const searchId = requireToken(parts && parts.searchId, 'empty_searchId');
  return `${host}/${guid}/IN/${searchId}.json`;
}

/**
 * Absolute path under the rclone / mapped drive root.
 * @param {{ root: string, host: string, guid: string, searchId: string }} opts
 * @returns {string}
 */
function aClubsInAbsPath(opts) {
  const root = opts && opts.root != null ? String(opts.root).trim() : '';
  if (!root) throw new AClubsPathError('empty_root');
  const key = aClubsInKey(opts);
  return path.join(root, ...key.split('/'));
}

/**
 * Resolve host/guid from a drain message (entry fan-out + optional widget fields).
 * @param {object} msg
 * @returns {{ host: string, guid: string }}
 */
function hostGuidFromMessage(msg) {
  if (!msg || typeof msg !== 'object') {
    throw new AClubsPathError('empty_host');
  }
  const host = String(msg.host || msg.hostname || msg.userId || '').trim();
  const guid = String(
    msg.widgetGuid || msg.guid || msg.catalogId || '',
  ).trim();
  return {
    host: requireToken(host, 'empty_host'),
    guid: requireToken(guid, 'empty_guid'),
  };
}

module.exports = {
  AClubsPathError,
  aClubsInKey,
  aClubsInAbsPath,
  hostGuidFromMessage,
};
