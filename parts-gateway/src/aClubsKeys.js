'use strict';

/**
 * FR #3968: S3 object keys under bucket a-clubs (no env/x prefix).
 */

const { safeHostFolderName } = require('../../shared/widgets/hostFolderMeta');
const { assertWidgetGuid } = require('../../shared/widgets/widgetPath');
const { assertUserId } = require('../../shared/identity/userId');

/**
 * @param {unknown} host
 * @returns {string} hostkey/
 */
function hostMarkerKey(host) {
  return `${safeHostFolderName(host)}/`;
}

/**
 * @param {string} userid
 * @returns {string}
 */
function useridClaimKey(userid) {
  return `_userids/${assertUserId(userid)}`;
}

/**
 * Zero-byte GUID folder marker key (trailing slash).
 * Metadata (uri/seen/clicks/since/init/lastmod) lives here --- not on widget.json.
 * @param {unknown} host
 * @param {unknown} widgetGuid
 * @returns {string}
 */
function guidMarkerKey(host, widgetGuid) {
  const hostkey = safeHostFolderName(host);
  const guid = assertWidgetGuid(widgetGuid);
  return `${hostkey}/${guid}/`;
}

/**
 * @param {unknown} host
 * @param {unknown} widgetGuid
 * @param {string} name
 * @returns {string}
 */
function widgetFileKey(host, widgetGuid, name) {
  const hostkey = safeHostFolderName(host);
  const guid = assertWidgetGuid(widgetGuid);
  const file = String(name || '').replace(/^\/+/, '');
  if (!file || file.includes('..') || file.includes('\\')) {
    const err = new Error('invalid_widget_file');
    err.code = 'invalid_widget_file';
    throw err;
  }
  return `${hostkey}/${guid}/${file}`;
}

/**
 * @param {unknown} host
 * @param {unknown} widgetGuid
 * @returns {string} prefix for IN/ listing
 */
function widgetInPrefix(host, widgetGuid) {
  const hostkey = safeHostFolderName(host);
  const guid = assertWidgetGuid(widgetGuid);
  return `${hostkey}/${guid}/IN/`;
}

module.exports = {
  hostMarkerKey,
  guidMarkerKey,
  useridClaimKey,
  widgetFileKey,
  widgetInPrefix,
};
