'use strict';

/**
 * Canonical ComponentsPiece storage paths (FR-197 / FR-232 / FR-233).
 * Physical prefix: {env}/x/{customerNumber}/[{widgetGuid}/...]
 * Only place that builds widget tree keys.
 */

const WIDGET_GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * @param {unknown} widgetGuid
 * @returns {string} lowercase canonical GUID
 * @throws {{ message: string }} with /invalid_widget_guid/
 */
function assertWidgetGuid(widgetGuid) {
  const g =
    widgetGuid == null ? '' : String(widgetGuid).trim().toLowerCase();
  if (!WIDGET_GUID_RE.test(g)) {
    const err = new Error('invalid_widget_guid');
    err.code = 'invalid_widget_guid';
    throw err;
  }
  return g;
}

/**
 * @param {unknown} env
 * @returns {'live'|'sandbox'}
 */
function assertEnv(env) {
  const e = env == null ? '' : String(env).trim();
  if (e !== 'live' && e !== 'sandbox') {
    const err = new Error('invalid_env');
    err.code = 'invalid_env';
    throw err;
  }
  return e;
}

/**
 * @param {unknown} customerNumber
 * @returns {string}
 */
function assertCustomerNumber(customerNumber) {
  const c =
    customerNumber == null ? '' : String(customerNumber).trim();
  if (!c) {
    const err = new Error('empty_customer_number');
    err.code = 'empty_customer_number';
    throw err;
  }
  if (c.includes('..') || c.includes('/') || c.includes('\\')) {
    const err = new Error('invalid_customer_number');
    err.code = 'invalid_customer_number';
    throw err;
  }
  return c;
}

/**
 * @param {string} env
 * @returns {string} e.g. sandbox/x
 */
function physicalPrefix(env) {
  return `${assertEnv(env)}/x`;
}

/**
 * @param {string} env
 * @param {string|number} customerNumber
 * @returns {string} e.g. sandbox/x/42
 */
function hostDir(env, customerNumber) {
  return `${physicalPrefix(env)}/${assertCustomerNumber(customerNumber)}`;
}

/**
 * @param {string} env
 * @param {string|number} customerNumber
 * @param {string} widgetGuid
 * @returns {string} e.g. sandbox/x/42/{guid}
 */
function widgetDir(env, customerNumber, widgetGuid) {
  const g = assertWidgetGuid(widgetGuid);
  return `${hostDir(env, customerNumber)}/${g}`;
}

/**
 * @param {string} env
 * @param {string|number} customerNumber
 * @param {string} widgetGuid
 * @param {string} name file name (no path separators)
 * @returns {string}
 */
function widgetFile(env, customerNumber, widgetGuid, name) {
  const n = name == null ? '' : String(name).trim();
  if (!n || n.includes('..') || n.includes('/') || n.includes('\\')) {
    const err = new Error('invalid_widget_file');
    err.code = 'invalid_widget_file';
    throw err;
  }
  return `${widgetDir(env, customerNumber, widgetGuid)}/${n}`;
}

module.exports = {
  assertWidgetGuid,
  physicalPrefix,
  hostDir,
  widgetDir,
  widgetFile,
  WIDGET_GUID_RE,
};
