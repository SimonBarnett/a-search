'use strict';

/**
 * FR-3355: classify ComponentsPiece widget-tree S3 keys for agent queue events.
 * in_ready = ObjectCreated under {env}/x/{customerNumber}/{widgetGuid}/IN/{searchId}.json
 * (FR-3344). Never fire on legacy in.json, IN/.processing/, or agent outputs.
 */

const { WIDGET_GUID_RE } = (() => {
  // Keep regex aligned with widgetPath.assertWidgetGuid without circular require.
  return {
    WIDGET_GUID_RE:
      /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  };
})();

const IN_READY_EVENT = 'in_ready';

/**
 * Normalize S3 key to forward-slash path without leading slash.
 * @param {unknown} key
 * @returns {string}
 */
function normalizeKey(key) {
  return String(key == null ? '' : key)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

/**
 * True when key is a ready inbound search file under IN/ (not .processing).
 * @param {unknown} s3Key
 * @returns {boolean}
 */
function isInReadyKey(s3Key) {
  const key = normalizeKey(s3Key);
  // {env}/x/{customer}/{guid}/IN/{file}.json
  const m = key.match(
    /^(live|sandbox)\/x\/([^/]+)\/([0-9a-f-]{36})\/IN\/([^/]+\.json)$/i,
  );
  if (!m) return false;
  const file = m[4];
  if (!file || file.startsWith('.')) return false;
  if (file.toLowerCase() === '.processing') return false;
  const guid = String(m[3]).toLowerCase();
  if (!WIDGET_GUID_RE.test(guid)) return false;
  return true;
}

/**
 * Classify a widget-tree S3 object key into an agent event (or null).
 * @param {unknown} s3Key
 * @returns {null|{
 *   eventType: string,
 *   env: string,
 *   customerNumber: string,
 *   widgetGuid: string|null,
 *   searchId?: string,
 *   s3Key: string,
 * }}
 */
function classifyWidgetS3Key(s3Key) {
  const key = normalizeKey(s3Key);
  if (!key) return null;

  // host_created: {env}/x/{customer}/_host.json
  let m = key.match(/^(live|sandbox)\/x\/([^/]+)\/_host\.json$/i);
  if (m) {
    return {
      eventType: 'host_created',
      env: m[1].toLowerCase(),
      customerNumber: m[2],
      widgetGuid: null,
      s3Key: key,
    };
  }

  // widget_created: .../{guid}/widget.json
  m = key.match(
    /^(live|sandbox)\/x\/([^/]+)\/([0-9a-f-]{36})\/widget\.json$/i,
  );
  if (m && WIDGET_GUID_RE.test(String(m[3]).toLowerCase())) {
    return {
      eventType: 'widget_created',
      env: m[1].toLowerCase(),
      customerNumber: m[2],
      widgetGuid: String(m[3]).toLowerCase(),
      s3Key: key,
    };
  }

  // widget_feedback: .../{guid}/feedback.json
  m = key.match(
    /^(live|sandbox)\/x\/([^/]+)\/([0-9a-f-]{36})\/feedback\.json$/i,
  );
  if (m && WIDGET_GUID_RE.test(String(m[3]).toLowerCase())) {
    return {
      eventType: 'widget_feedback',
      env: m[1].toLowerCase(),
      customerNumber: m[2],
      widgetGuid: String(m[3]).toLowerCase(),
      s3Key: key,
    };
  }

  // in_ready: .../{guid}/IN/{searchId}.json (FR-3344 / FR-3355)
  m = key.match(
    /^(live|sandbox)\/x\/([^/]+)\/([0-9a-f-]{36})\/IN\/([^/]+)\.json$/i,
  );
  if (
    m &&
    WIDGET_GUID_RE.test(String(m[3]).toLowerCase()) &&
    isInReadyKey(key)
  ) {
    return {
      eventType: IN_READY_EVENT,
      env: m[1].toLowerCase(),
      customerNumber: m[2],
      widgetGuid: String(m[3]).toLowerCase(),
      searchId: m[4],
      s3Key: key,
    };
  }

  return null;
}

module.exports = {
  IN_READY_EVENT,
  normalizeKey,
  isInReadyKey,
  classifyWidgetS3Key,
};
