'use strict';

/**
 * FR #5142: re-check GUID folders whose search-fanout DONE set is complete
 * but marker hasresults is still missing/0 (race / rclone lag / swallowed flip).
 *
 * FR #5265: do not re-flip after the monitor cleared hasresults=0 for the same
 * fan-out searchid (promotedsearchid stamp, with enabled+DONE-at fallback).
 */

const {
  maybeSetHasResults,
  loadFanout,
  doneExists,
  doneObjectKey,
  legacyDoneObjectKey,
  bodyToBuffer,
} = require('./searchDone');

/**
 * GUID folder marker keys only (host/guid/). Local copy of redqueen classifyMarkerKey.
 * @param {string} key
 * @returns {{ hostkey: string, guid: string, key: string }|null}
 */
function classifyGuidMarkerKey(key) {
  const k = String(key || '');
  const m = /^([^/]+)\/([0-9a-fA-F-]{36})\/$/.exec(k);
  if (!m) return null;
  return { hostkey: m[1], guid: m[2].toLowerCase(), key: k };
}

/**
 * @param {Record<string, string|undefined>|undefined} md
 * @returns {boolean}
 */
function hasResultsAlreadySet(md) {
  return String((md && md.hasresults) || '') === '1';
}

/**
 * @param {object} opts
 * @returns {Promise<boolean>}
 */
async function fanoutDoneComplete(opts) {
  const fanout = await loadFanout(opts);
  if (!fanout) return false;
  const wantSid = String(opts.searchid || fanout.searchid || '').trim();
  if (!wantSid || fanout.searchid !== wantSid) return false;
  for (const src of fanout.queued) {
    const ok = await doneExists({ ...opts, searchid: wantSid }, src);
    if (!ok) return false;
  }
  return true;
}

/**
 * @param {unknown} raw
 * @returns {number} epoch ms or 0
 */
function parseTimeMs(raw) {
  if (raw == null || raw === '') return 0;
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : 0;
}

/**
 * Newest DONE record `at` (or LastModified) for this fan-out searchid.
 * @param {object} opts
 * @returns {Promise<number>}
 */
async function maxSearchDoneAtMs(opts) {
  const hostkey = String(opts.hostkey || opts.host || '').trim();
  const guid = String(opts.guid || '').trim();
  const searchid = String(opts.searchid || '').trim();
  const queued = Array.isArray(opts.queued) ? opts.queued : [];
  if (!searchid || !queued.length || typeof opts.getObject !== 'function') {
    return 0;
  }
  let max = 0;
  for (const src of queued) {
    const keys = [
      doneObjectKey(hostkey, guid, searchid, src),
      legacyDoneObjectKey(hostkey, guid, searchid, src),
    ];
    for (const Key of keys) {
      try {
        const out = await opts.getObject({ Bucket: opts.bucket, Key });
        const lm = parseTimeMs(out && (out.LastModified || out.lastModified));
        if (lm > max) max = lm;
        const raw = (await bodyToBuffer(out.Body)).toString('utf8');
        try {
          const doc = JSON.parse(raw);
          const at = parseTimeMs(doc && doc.at);
          if (at > max) max = at;
        } catch {
          /* ignore bad JSON */
        }
        break;
      } catch (err) {
        const code = err && (err.name || err.code || err.Code);
        const status = err && err.$metadata && err.$metadata.httpStatusCode;
        if (
          code === 'NoSuchKey' ||
          code === 'NotFound' ||
          status === 404
        ) {
          continue;
        }
        throw err;
      }
    }
  }
  return max;
}

/**
 * FR #5265: skip recheck flip when this searchid was already promoted and the
 * monitor cleared hasresults, unless newer DONE landed after lastmod.
 * @param {object} opts
 * @returns {Promise<{ skip: boolean, reason?: string }>}
 */
async function isAlreadyPromotedForFanout(opts) {
  const md = opts.metadata || {};
  const searchid = String(opts.searchid || '').trim();
  if (!searchid) return { skip: false, reason: 'no_searchid' };
  const stamped = String(md.promotedsearchid || '').trim();
  if (stamped && stamped === searchid) {
    return { skip: true, reason: 'promotedsearchid' };
  }
  // Legacy markers (pre-#5265): enabled=1 after a successful promote+clear.
  if (String(md.enabled || '') !== '1') {
    return { skip: false, reason: 'not_enabled' };
  }
  const lastmodMs = parseTimeMs(md.lastmod);
  const maxDoneMs = await maxSearchDoneAtMs(opts);
  if (maxDoneMs > 0 && lastmodMs > 0 && lastmodMs >= maxDoneMs) {
    return { skip: true, reason: 'enabled_lastmod' };
  }
  if (maxDoneMs === 0 && lastmodMs > 0) {
    return { skip: true, reason: 'enabled_no_done_at' };
  }
  return { skip: false, reason: 'newer_done_or_unknown' };
}

/**
 * If every queued source has a DONE record and hasresults != 1, flip the S3 marker.
 * @returns {Promise<{ flipped: boolean, reason?: string, flip?: object }>}
 */
async function recheckGuidHasResults(opts) {
  const hostkey = String(opts.hostkey || opts.host || '').trim();
  const guid = String(opts.guid || '').trim();
  if (!hostkey || !guid) {
    return { flipped: false, reason: 'missing_path' };
  }
  const Key = `${hostkey}/${guid}/`;
  let metadata = {};
  if (typeof opts.headObject === 'function') {
    try {
      const head = await opts.headObject({
        Bucket: opts.bucket,
        Key,
      });
      metadata = (head && (head.Metadata || head.metadata)) || {};
    } catch (err) {
      const code = err && (err.name || err.code || err.Code);
      const status = err && err.$metadata && err.$metadata.httpStatusCode;
      if (
        code === 'NotFound' ||
        code === 'NoSuchKey' ||
        status === 404
      ) {
        return { flipped: false, reason: 'no_marker' };
      }
      throw err;
    }
  }
  if (hasResultsAlreadySet(metadata)) {
    return { flipped: false, reason: 'already_set' };
  }

  const fanout = await loadFanout({ ...opts, hostkey, guid });
  if (!fanout) return { flipped: false, reason: 'no_fanout' };
  const searchid = fanout.searchid;
  const complete = await fanoutDoneComplete({
    ...opts,
    hostkey,
    guid,
    searchid,
  });
  if (!complete) return { flipped: false, reason: 'incomplete' };

  const promoted = await isAlreadyPromotedForFanout({
    ...opts,
    hostkey,
    guid,
    searchid,
    queued: fanout.queued,
    metadata,
  });
  if (promoted.skip) {
    return { flipped: false, reason: 'already_promoted' };
  }

  try {
    const flip = await maybeSetHasResults({
      ...opts,
      hostkey,
      guid,
      searchid,
    });
    return {
      flipped: !!flip.hasresults,
      reason: flip.hasresults ? 'flipped' : flip.reason || 'not_flipped',
      flip,
    };
  } catch (err) {
    if (typeof opts.logError === 'function') {
      opts.logError(
        '[a-search]',
        'ERROR',
        'hasresults_recheck_flip_failed',
        String((err && err.message) || err),
      );
    }
    return {
      flipped: false,
      reason: 'flip_error',
      error: String((err && err.message) || err),
    };
  }
}

/**
 * Scan GUID markers; flip any with complete DONE set and hasresults != 1.
 * @param {object} opts
 * @returns {Promise<{ scanned: number, flipped: number, actions: object[] }>}
 */
async function recheckIncompleteHasResults(opts) {
  if (!opts || typeof opts.listObjectsV2 !== 'function') {
    return { scanned: 0, flipped: 0, actions: [] };
  }
  const headObject = opts.headObject;
  /** @type {Array<{ hostkey: string, guid: string, key: string, metadata: object }>} */
  const candidates = [];
  let ContinuationToken;
  do {
    const resp = await opts.listObjectsV2({ ContinuationToken });
    const contents = (resp && resp.Contents) || [];
    for (let i = 0; i < contents.length; i += 1) {
      const item = contents[i];
      const classified = classifyGuidMarkerKey(item && item.Key);
      if (!classified) continue;
      let metadata = {};
      if (typeof headObject === 'function') {
        try {
          const head = await headObject({ Key: classified.key });
          metadata = (head && (head.Metadata || head.metadata)) || {};
        } catch (err) {
          const status = err && err.$metadata && err.$metadata.httpStatusCode;
          const code = err && (err.name || err.code);
          if (status === 404 || code === 'NotFound' || code === 'NoSuchKey') {
            continue;
          }
          throw err;
        }
      }
      if (hasResultsAlreadySet(metadata)) continue;
      candidates.push({
        key: classified.key,
        hostkey: classified.hostkey,
        guid: classified.guid,
        metadata,
      });
    }
    ContinuationToken =
      resp && resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (ContinuationToken);

  const actions = [];
  let flipped = 0;
  for (const row of candidates) {
    const out = await recheckGuidHasResults({
      ...opts,
      hostkey: row.hostkey,
      guid: row.guid,
    });
    actions.push({ ...row, ...out });
    if (out.flipped) flipped += 1;
  }
  return { scanned: candidates.length, flipped, actions };
}

module.exports = {
  hasResultsAlreadySet,
  fanoutDoneComplete,
  maxSearchDoneAtMs,
  isAlreadyPromotedForFanout,
  recheckGuidHasResults,
  recheckIncompleteHasResults,
};
