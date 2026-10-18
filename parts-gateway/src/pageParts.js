'use strict';

/**
 * FR #3968: S3 a-clubs backed GET /parts page (auto-create host + GUID).
 * Host from Origin only; returns init; promotes IN/ -> live.json when init=0.
 */

const { assertWidgetGuid } = require('../../shared/widgets/widgetPath');
const {
  setInit,
  touchLastmod,
  partsResponseLeaksSecrets,
} = require('../../shared/widgets/hostFolderMeta');
const { ensureAclubsHost } = require('./ensureHost');
const { ensureAclubsWidget } = require('./ensureWidget');
const {
  widgetFileKey,
  widgetInPrefix,
  hostMarkerKey,
  guidMarkerKey,
} = require('./aClubsKeys');
const { requireHostFromOrigin } = require('./originHost');

class PartsError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'PartsError';
    this.code = code;
  }
}

/**
 * @param {unknown} raw
 * @param {number} fallback
 * @returns {number}
 */
function parseNonNegInt(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new PartsError('invalid_offset_or_n');
  }
  return n;
}

/**
 * @param {unknown} body
 * @returns {object[]}
 */
function parseLiveBody(body) {
  if (body == null) return [];
  let text;
  if (Buffer.isBuffer(body)) text = body.toString('utf8');
  else if (typeof body === 'string') text = body;
  else if (typeof body.transformToString === 'function') {
    return [];
  } else {
    text = String(body);
  }
  try {
    const raw = JSON.parse(text);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * @param {unknown} raw
 * @returns {0|1}
 */
function parseInitFlag(raw) {
  return raw === 1 || raw === '1' ? 1 : 0;
}

/**
 * Collect candidate objects from {guid}/IN/*.json
 * @param {{
 *   host: string,
 *   guid: string,
 *   listObjectsV2?: Function,
 *   getObject: Function,
 * }} opts
 * @returns {Promise<object[]>}
 */
async function loadInCandidates(opts) {
  if (typeof opts.listObjectsV2 !== 'function') return [];
  /** @type {object[]} */
  const out = [];
  try {
    const listed = await opts.listObjectsV2({
      Prefix: widgetInPrefix(opts.host, opts.guid),
    });
    const contents = (listed && listed.Contents) || [];
    for (const c of contents) {
      if (!c || !c.Key || !String(c.Key).endsWith('.json')) continue;
      try {
        const obj = await opts.getObject({ Key: c.Key });
        let body = obj && obj.Body;
        if (body && typeof body.transformToString === 'function') {
          body = await body.transformToString();
        }
        const parsed = parseLiveBody(body);
        if (parsed.length) {
          for (const row of parsed) out.push(row);
        } else if (body) {
          const one = JSON.parse(
            Buffer.isBuffer(body) ? body.toString('utf8') : String(body),
          );
          if (one && typeof one === 'object' && !Array.isArray(one)) {
            out.push(one);
          }
        }
      } catch {
        // skip bad IN objects
      }
    }
  } catch {
    // listing optional
  }
  return out;
}

/**
 * @param {{
 *   origin?: string,
 *   widgetGuid: string,
 *   offset?: number|string,
 *   n?: number|string,
 *   layout?: string,
 *   referer?: string,
 *   pageUri?: string,
 *   uri?: string,
 *   host?: string,
 *   headObject: Function,
 *   putObject: Function,
 *   getObject: Function,
 *   listObjectsV2?: Function,
 *   putObjectTagging?: Function,
 *   getObjectTagging?: Function,
 *   copyObject?: Function,
 *   mint?: () => string,
 *   sendMessage?: Function,
 *   folderEventsQueueUrl?: string,
 *   now?: Date|string|number,
 * }} opts
 */
async function pagePartsAclubs(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new PartsError('parts_opts_required');
  }

  // Host from Origin only --- ignore ?host=
  const originCheck = requireHostFromOrigin(opts.origin);
  if (!originCheck.ok) {
    throw new PartsError(originCheck.code);
  }
  const host = originCheck.host;

  if (opts.widgetGuid == null || String(opts.widgetGuid).trim() === '') {
    throw new PartsError('widget_guid_required');
  }
  let guid;
  try {
    guid = assertWidgetGuid(opts.widgetGuid);
  } catch {
    throw new PartsError('invalid_widget_guid');
  }

  const offset = parseNonNegInt(opts.offset, 0);
  const n = parseNonNegInt(opts.n, 10);
  if (n === 0) {
    throw new PartsError('invalid_offset_or_n');
  }

  const s3Meta = {
    headObject: opts.headObject,
    putObject: opts.putObject,
    getObject: opts.getObject,
    copyObject: opts.copyObject,
    getObjectTagging: opts.getObjectTagging,
    putObjectTagging: opts.putObjectTagging,
    now: opts.now,
  };

  const hostInfo = await ensureAclubsHost({
    host,
    headObject: opts.headObject,
    putObject: opts.putObject,
    putObjectTagging: opts.putObjectTagging,
    mint: opts.mint,
    sendMessage: opts.sendMessage,
    folderEventsQueueUrl: opts.folderEventsQueueUrl,
    now: opts.now,
  });

  const widgetInfo = await ensureAclubsWidget({
    host,
    widgetGuid: guid,
    customerNumber: hostInfo.customerNumber,
    layout: opts.layout,
    referer: opts.referer,
    pageUri: opts.pageUri,
    uri: opts.uri,
    headObject: opts.headObject,
    putObject: opts.putObject,
    getObject: opts.getObject,
    copyObject: opts.copyObject,
    getObjectTagging: opts.getObjectTagging,
    putObjectTagging: opts.putObjectTagging,
    sendMessage: opts.sendMessage,
    folderEventsQueueUrl: opts.folderEventsQueueUrl,
    now: opts.now,
  });

  const guidKey = guidMarkerKey(host, guid);
  let init = parseInitFlag(
    widgetInfo.metadata && widgetInfo.metadata.init,
  );

  const liveKey = widgetFileKey(host, guid, 'live.json');
  let live = [];
  try {
    const obj = await opts.getObject({ Key: liveKey });
    let body = obj && (obj.Body != null ? obj.Body : obj.body);
    if (body && typeof body.transformToString === 'function') {
      body = await body.transformToString();
    }
    live = parseLiveBody(body);
  } catch (err) {
    const status = err && err.$metadata && err.$metadata.httpStatusCode;
    const code = err && (err.name || err.code);
    if (status !== 404 && code !== 'NoSuchKey' && code !== 'NotFound') {
      throw err;
    }
  }

  const inCandidates = await loadInCandidates({
    host,
    guid,
    listObjectsV2: opts.listObjectsV2,
    getObject: opts.getObject,
  });

  // When init is 0 and IN/ has candidates, promote into live.json and setInit.
  if (init === 0 && inCandidates.length > 0) {
    live = live.concat(inCandidates);
    const Body = Buffer.from(`${JSON.stringify(live, null, 2)}\n`, 'utf8');
    await opts.putObject({
      Key: liveKey,
      Body,
      ContentLength: Body.length,
      ContentType: 'application/json; charset=utf-8',
    });
    await setInit({ Key: guidKey, ...s3Meta });
    await touchLastmod({ Key: hostMarkerKey(host), ...s3Meta });
    init = 1;
  }

  const slice = live.slice(offset, offset + n);
  const next = offset + n;
  const nextOffset = next < live.length ? next : null;

  const response = {
    customerNumber: hostInfo.customerNumber,
    widgetGuid: guid,
    layout: widgetInfo.layout,
    parts: slice,
    nextOffset,
    init,
  };
  if (partsResponseLeaksSecrets(response)) {
    throw new PartsError('parts_response_secret_leak');
  }
  return response;
}

module.exports = {
  pagePartsAclubs,
  parseLiveBody,
  PartsError,
  parseNonNegInt,
  parseInitFlag,
};
