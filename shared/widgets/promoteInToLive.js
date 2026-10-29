'use strict';

/**
 * FR #4891 / FR #5270: promote a-clubs/{host}/{guid}/IN/*.json into live.json
 * and set enabled=1 on the GUID marker. **Only** the hasresults monitor /
 * agent path calls this (runHasresultsAgentWork). Search workers and drains
 * set hasresults=1 only — they never write live.json. /parts must not promote.
 */

const {
  setEnabled,
  touchLastmod,
  safeHostFolderName,
} = require('./hostFolderMeta');
const { assertWidgetGuid } = require('./widgetPath');
const { filterPartsByPage } = require('./pageSelect');
const { recordNoResultsIfEmpty } = require('../search/noResultsFeedback');

/**
 * @param {unknown} host
 * @param {unknown} widgetGuid
 * @returns {string}
 */
function guidMarkerKey(host, widgetGuid) {
  return `${safeHostFolderName(host)}/${assertWidgetGuid(widgetGuid)}/`;
}

/**
 * @param {unknown} host
 * @returns {string}
 */
function hostMarkerKey(host) {
  return `${safeHostFolderName(host)}/`;
}

/**
 * @param {unknown} host
 * @param {unknown} widgetGuid
 * @param {string} name
 * @returns {string}
 */
function widgetFileKey(host, widgetGuid, name) {
  const file = String(name || '').replace(/^\/+/, '');
  return `${safeHostFolderName(host)}/${assertWidgetGuid(widgetGuid)}/${file}`;
}

/**
 * @param {unknown} host
 * @param {unknown} widgetGuid
 * @returns {string}
 */
function widgetInPrefix(host, widgetGuid) {
  return `${safeHostFolderName(host)}/${assertWidgetGuid(widgetGuid)}/IN/`;
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
 * @param {unknown} resp
 * @returns {object|null}
 */
function parseAnnotationBody(resp) {
  if (!resp) return null;
  let body = resp.AnnotationPayload != null ? resp.AnnotationPayload : resp.Body;
  if (body && typeof body.transformToString === 'function') {
    return null;
  }
  try {
    const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '');
    const obj = JSON.parse(text);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
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
function objectSearchid(body) {
  try {
    const raw = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '');
    const one = JSON.parse(raw);
    if (!one || typeof one !== 'object' || Array.isArray(one)) return '';
    return String(one.searchid != null ? one.searchid : one.searchId || '').trim();
  } catch {
    return '';
  }
}

async function loadInCandidates(opts) {
  if (typeof opts.listObjectsV2 !== 'function') return [];
  const want = String(opts.currentSearchid || '').trim();
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
        const key = String(c.Key).replace(/\\/g, '/');
        if (key.toLowerCase().endsWith('/in/sql.json') && want) {
          const got = objectSearchid(body);
          if (got && got !== want) continue;
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
 * Promote IN/ → live.json and set enabled=1 (empty IN still enables → no_parts).
 * @param {{
 *   host: string,
 *   guid: string,
 *   getObject: Function,
 *   putObject: Function,
 *   listObjectsV2?: Function,
 *   getObjectAnnotation?: Function,
 *   headObject?: Function,
 *   copyObject?: Function,
 *   getObjectTagging?: Function,
 *   putObjectTagging?: Function,
 *   now?: Date|string|number,
 *   bucket?: string,
 * }} opts
 * @returns {Promise<{
 *   Key: string,
 *   liveKey: string,
 *   enabled: 1,
 *   live: object[],
 *   inCount: number,
 * }>}
 */
async function promoteInToLive(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('promoteInToLive opts required');
  }
  if (typeof opts.getObject !== 'function' || typeof opts.putObject !== 'function') {
    throw new Error('getObject_and_putObject_required');
  }
  const host = String(opts.host || '').trim();
  const guid = String(opts.guid || '').trim();
  if (!host || !guid) {
    throw new Error('host_and_guid_required');
  }

  const guidKey = guidMarkerKey(host, guid);
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

  let currentSearchid = '';
  try {
    const fan = await opts.getObject({
      Key: widgetFileKey(host, guid, 'search-fanout.json'),
    });
    let fanBody = fan && (fan.Body != null ? fan.Body : fan.body);
    if (fanBody && typeof fanBody.transformToString === 'function') {
      fanBody = await fanBody.transformToString();
    }
    const fanObj = JSON.parse(
      Buffer.isBuffer(fanBody) ? fanBody.toString('utf8') : String(fanBody || ''),
    );
    currentSearchid = String(
      (fanObj && (fanObj.searchid != null ? fanObj.searchid : fanObj.searchId)) ||
        '',
    ).trim();
  } catch {
    currentSearchid = '';
  }

  const inCandidates = await loadInCandidates({
    host,
    guid,
    currentSearchid,
    listObjectsV2: opts.listObjectsV2,
    getObject: opts.getObject,
  });

  let pageAnn = null;
  let hostAnn = null;
  if (typeof opts.getObjectAnnotation === 'function') {
    try {
      const pa = await opts.getObjectAnnotation({
        Key: guidKey,
        AnnotationName: 'annotation',
      });
      pageAnn = parseAnnotationBody(pa);
    } catch {
      pageAnn = null;
    }
    try {
      const ha = await opts.getObjectAnnotation({
        Key: hostMarkerKey(host),
        AnnotationName: 'annotation',
      });
      hostAnn = parseAnnotationBody(ha);
    } catch {
      hostAnn = null;
    }
  }

  const selected = pageAnn
    ? filterPartsByPage(inCandidates, { page: pageAnn, host: hostAnn })
    : inCandidates;
  live = live.concat(selected);

  const Body = Buffer.from(`${JSON.stringify(live, null, 2)}\n`, 'utf8');
  const putArgs = {
    Key: liveKey,
    Body,
    ContentLength: Body.length,
    ContentType: 'application/json; charset=utf-8',
  };
  if (opts.bucket) putArgs.Bucket = opts.bucket;
  await opts.putObject(putArgs);

  const s3Meta = {
    headObject: opts.headObject,
    putObject: opts.putObject,
    getObject: opts.getObject,
    copyObject: opts.copyObject,
    getObjectTagging: opts.getObjectTagging,
    putObjectTagging: opts.putObjectTagging,
    now: opts.now,
    bucket: opts.bucket,
  };
  await setEnabled({ Key: guidKey, ...s3Meta });
  try {
    await touchLastmod({ Key: hostMarkerKey(host), ...s3Meta });
  } catch {
    // Host marker may be absent in unit fixtures; GUID enable + live write still count.
  }

  return {
    Key: guidKey,
    liveKey,
    enabled: 1,
    live,
    inCount: inCandidates.length,
  };
}

/**
 * List IN/*.json object keys for a GUID (FR #4918 delete-after-process).
 * @param {{
 *   host: string,
 *   guid: string,
 *   listObjectsV2?: Function,
 * }} opts
 * @returns {Promise<string[]>}
 */
async function listInObjectKeys(opts) {
  if (!opts || typeof opts.listObjectsV2 !== 'function') return [];
  /** @type {string[]} */
  const keys = [];
  try {
    const listed = await opts.listObjectsV2({
      Prefix: widgetInPrefix(opts.host, opts.guid),
    });
    const contents = (listed && listed.Contents) || [];
    for (const c of contents) {
      if (!c || !c.Key || !String(c.Key).endsWith('.json')) continue;
      keys.push(String(c.Key));
    }
  } catch {
    // listing optional
  }
  return keys;
}

/**
 * Delete only the IN keys this run processed (FR #4918). Keys that appear
 * after the snapshot stay for the next pass.
 * @param {{
 *   keys: string[],
 *   deleteObject: Function,
 *   bucket?: string,
 * }} opts
 * @returns {Promise<{ deleted: string[], failed: Array<{ key: string, error: string }> }>}
 */
async function deleteProcessedInFiles(opts) {
  if (!opts || typeof opts.deleteObject !== 'function') {
    throw new Error('deleteObject_required');
  }
  const keys = Array.isArray(opts.keys) ? opts.keys : [];
  /** @type {string[]} */
  const deleted = [];
  /** @type {Array<{ key: string, error: string }>} */
  const failed = [];
  for (const key of keys) {
    try {
      const args = { Key: key };
      if (opts.bucket) args.Bucket = opts.bucket;
      await opts.deleteObject(args);
      deleted.push(key);
    } catch (err) {
      failed.push({
        key,
        error: String((err && err.message) || err),
      });
    }
  }
  return { deleted, failed };
}

/**
 * FR #4918 agent work (deterministic): promote IN → live.json, set enabled=1,
 * delete the IN files read in this run. Does not write hasresults.
 * @param {Parameters<typeof promoteInToLive>[0] & {
 *   deleteObject?: Function,
 *   failBeforeDelete?: boolean,
 * }} opts
 */
async function runHasresultsAgentWork(opts) {
  const keysBefore = await listInObjectKeys(opts);
  const promote = await promoteInToLive(opts);
  if (opts && opts.failBeforeDelete) {
    const err = new Error('agent_fail_before_delete');
    err.code = 'agent_fail_before_delete';
    throw err;
  }
  let deleted = { deleted: [], failed: [] };
  if (typeof opts.deleteObject === 'function' && keysBefore.length) {
    deleted = await deleteProcessedInFiles({
      keys: keysBefore,
      deleteObject: opts.deleteObject,
      bucket: opts.bucket,
    });
  }
  // FR #5047 / #5270: no-results feedback after the agent builds live.json.
  let noResults = null;
  try {
    const live = promote && Array.isArray(promote.live) ? promote.live : [];
    noResults = await recordNoResultsIfEmpty({
      host: opts.host || opts.hostkey,
      guid: opts.guid,
      searchid: opts.searchid,
      live,
      partCount: live.length,
      bucket: opts.bucket,
      now: opts.now,
      putObject: opts.putObject,
      getObject: opts.getObject,
      getObjectAnnotation: opts.getObjectAnnotation,
      logError: opts.logError,
    });
  } catch (err) {
    noResults = {
      recorded: false,
      reason: 'error',
      error: String((err && err.message) || err),
    };
  }
  return {
    ok: true,
    liveWritten: true,
    enabled: 1,
    promote,
    noResults,
    inKeys: keysBefore,
    deleted: deleted.deleted,
    deleteFailed: deleted.failed,
  };
}

module.exports = {
  promoteInToLive,
  loadInCandidates,
  listInObjectKeys,
  deleteProcessedInFiles,
  runHasresultsAgentWork,
  parseLiveBody,
  parseAnnotationBody,
  widgetInPrefix,
};
