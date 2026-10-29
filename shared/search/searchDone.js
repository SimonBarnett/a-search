'use strict';

/**
 * FR #4917 / FR #5198: per-(searchid, source) terminal records and flip GUID
 * marker hasresults=1 when every fan-out queued source is terminal (serviced
 * or dlq). Stale searchid records are ignored.
 *
 * FR #5198: do **not** write under a-clubs/{host}/{guid}/DONE/. Completion
 * lives at a-clubs/_search-done/{searchid}/{source}.json (bucket-root ops
 * prefix outside the club GUID folder). Legacy host/guid/DONE/ keys are still
 * accepted by doneExists during transition; new writes never create them.
 *
 * FR #5270: search completion only sets hasresults=1. It does **not** write
 * live.json or enabled=1 — the hasresults monitor / agent SELECTS best parts
 * from IN/ (Simon #5256).
 */

const { setHasResults } = require('../widgets/hostFolderMeta');

/** Bucket-root prefix for search terminal records (FR #5198). */
const SEARCH_DONE_PREFIX = '_search-done';

/**
 * @param {Record<string, string|undefined>} [envVars]
 * @returns {string}
 */
function resolveAClubsBucket(envVars) {
  const env = envVars || {};
  for (const k of ['A_CLUBS_BUCKET', 'S3_ACLUBS_BUCKET', 'S3_A_CLUBS_BUCKET']) {
    const v = env[k] != null ? String(env[k]).trim() : '';
    if (v) return v;
  }
  return 'a-clubs';
}

/**
 * FR #5198: terminal key outside the GUID club folder.
 * hostkey/guid args kept for call-site compat; unused in the path.
 * @param {string} _hostkey
 * @param {string} _guid
 * @param {string} searchid
 * @param {string} source
 * @returns {string}
 */
function doneObjectKey(_hostkey, _guid, searchid, source) {
  const sid = String(searchid || '').trim();
  const src = String(source || '')
    .trim()
    .toLowerCase();
  return `${SEARCH_DONE_PREFIX}/${sid}/${src}.json`;
}

/**
 * Legacy FR #4917 path (read-only fallback during transition).
 * @param {string} hostkey
 * @param {string} guid
 * @param {string} searchid
 * @param {string} source
 * @returns {string}
 */
function legacyDoneObjectKey(hostkey, guid, searchid, source) {
  const host = String(hostkey || '').trim();
  const g = String(guid || '').trim();
  const sid = String(searchid || '').trim();
  const src = String(source || '')
    .trim()
    .toLowerCase();
  return `${host}/${g}/DONE/${sid}-${src}.json`;
}

/**
 * @param {unknown} body
 * @returns {Promise<Buffer>}
 */
async function bodyToBuffer(body) {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body == null) return Buffer.alloc(0);
  if (typeof body.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }
  if (typeof body.transformToString === 'function') {
    return Buffer.from(await body.transformToString(), 'utf8');
  }
  if (typeof body[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const c of body) chunks.push(Buffer.from(c));
    return Buffer.concat(chunks);
  }
  return Buffer.from(String(body));
}

/**
 * @param {{
 *   putObject: Function,
 *   hostkey: string,
 *   guid: string,
 *   searchid: string,
 *   source: string,
 *   status: 'serviced'|'dlq',
 *   products?: number,
 *   bucket?: string,
 *   now?: Date|string|number,
 *   envVars?: Record<string, string|undefined>,
 * }} opts
 */
async function writeSearchDoneRecord(opts) {
  if (!opts || typeof opts.putObject !== 'function') {
    throw new Error('writeSearchDoneRecord requires putObject');
  }
  const hostkey = String(opts.hostkey || '').trim();
  const guid = String(opts.guid || '').trim();
  const searchid = String(opts.searchid || '').trim();
  const source = String(opts.source || '')
    .trim()
    .toLowerCase();
  const status = String(opts.status || '').trim().toLowerCase();
  if (!hostkey || !guid || !searchid || !source) {
    return { skipped: 'missing_path', Key: null };
  }
  if (status !== 'serviced' && status !== 'dlq') {
    throw new Error('status must be serviced or dlq');
  }
  const bucket =
    opts.bucket || resolveAClubsBucket(opts.envVars || process.env);
  const at =
    opts.now == null
      ? new Date().toISOString()
      : opts.now instanceof Date
        ? opts.now.toISOString()
        : String(opts.now);
  const products = Number.isFinite(Number(opts.products))
    ? Math.max(0, Math.floor(Number(opts.products)))
    : 0;
  const Key = doneObjectKey(hostkey, guid, searchid, source);
  const bodyObj = {
    searchid,
    source,
    status,
    products,
    at,
    hostkey,
    guid,
  };
  const Body = `${JSON.stringify(bodyObj)}\n`;
  await opts.putObject({
    Bucket: bucket,
    Key,
    Body,
    ContentType: 'application/json; charset=utf-8',
  });
  return { Key, body: bodyObj, bucket };
}

/**
 * @param {object} opts
 * @returns {Promise<{ searchid: string, queued: string[] }|null>}
 */
async function loadFanout(opts) {
  if (typeof opts.getObject !== 'function') return null;
  const hostkey = String(opts.hostkey || '').trim();
  const guid = String(opts.guid || '').trim();
  if (!hostkey || !guid) return null;
  const bucket =
    opts.bucket || resolveAClubsBucket(opts.envVars || process.env);
  const Key = `${hostkey}/${guid}/search-fanout.json`;
  try {
    const out = await opts.getObject({ Bucket: bucket, Key });
    const raw = (await bodyToBuffer(out.Body)).toString('utf8');
    const doc = JSON.parse(raw);
    const searchid = String((doc && doc.searchid) || '').trim();
    const queued = Array.isArray(doc && doc.queued)
      ? doc.queued.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
      : [];
    if (!searchid || !queued.length) return null;
    return { searchid, queued };
  } catch (err) {
    const code = err && (err.name || err.code || err.Code);
    const status = err && err.$metadata && err.$metadata.httpStatusCode;
    if (
      code === 'NoSuchKey' ||
      code === 'NotFound' ||
      status === 404 ||
      (err && err.$response && err.$response.statusCode === 404)
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * @param {object} opts
 * @returns {Promise<boolean>}
 */
/**
 * @param {object} opts
 * @param {string} Key
 * @returns {Promise<boolean>}
 */
async function objectExists(opts, Key) {
  const bucket =
    opts.bucket || resolveAClubsBucket(opts.envVars || process.env);
  if (typeof opts.headObject === 'function') {
    try {
      await opts.headObject({ Bucket: bucket, Key });
      return true;
    } catch (err) {
      const code = err && (err.name || err.code || err.Code);
      const status = err && err.$metadata && err.$metadata.httpStatusCode;
      if (
        code === 'NotFound' ||
        code === 'NoSuchKey' ||
        status === 404 ||
        (err && err.$response && err.$response.statusCode === 404)
      ) {
        return false;
      }
      throw err;
    }
  }
  if (typeof opts.getObject !== 'function') return false;
  try {
    await opts.getObject({ Bucket: bucket, Key });
    return true;
  } catch (err) {
    const code = err && (err.name || err.code || err.Code);
    const status = err && err.$metadata && err.$metadata.httpStatusCode;
    if (
      code === 'NotFound' ||
      code === 'NoSuchKey' ||
      status === 404 ||
      (err && err.$response && err.$response.statusCode === 404)
    ) {
      return false;
    }
    throw err;
  }
}

async function doneExists(opts, source) {
  const hostkey = String(opts.hostkey || '').trim();
  const guid = String(opts.guid || '').trim();
  const searchid = String(opts.searchid || '').trim();
  const src = String(source || '')
    .trim()
    .toLowerCase();
  const Key = doneObjectKey(hostkey, guid, searchid, src);
  if (await objectExists(opts, Key)) return true;
  // FR #5198 transition: accept legacy GUID DONE/ written before this change.
  if (hostkey && guid) {
    const legacy = legacyDoneObjectKey(hostkey, guid, searchid, src);
    if (await objectExists(opts, legacy)) return true;
  }
  return false;
}

/**
 * Compare DONE set for fan-out searchid vs queued; set hasresults=1 when complete.
 * FR #5270: does **not** write live.json or set enabled — agent / hasresults
 * monitor builds live.json from IN/ (best-x). FR #5047 no-results feedback
 * runs after that agent promote (`runHasresultsAgentWork`).
 * @returns {Promise<{ hasresults: boolean, reason?: string }>}
 */
async function maybeSetHasResults(opts) {
  const hostkey = String(opts.hostkey || '').trim();
  const guid = String(opts.guid || '').trim();
  const wantSid = String(opts.searchid || '').trim();
  if (!hostkey || !guid || !wantSid) {
    return { hasresults: false, reason: 'missing_path' };
  }
  const fanout = await loadFanout(opts);
  if (!fanout) return { hasresults: false, reason: 'no_fanout' };
  if (fanout.searchid !== wantSid) {
    return { hasresults: false, reason: 'stale_searchid' };
  }
  for (const src of fanout.queued) {
    const ok = await doneExists(opts, src);
    if (!ok) return { hasresults: false, reason: `missing:${src}` };
  }
  const bucket =
    opts.bucket || resolveAClubsBucket(opts.envVars || process.env);
  const Key = `${hostkey}/${guid}/`;
  // FR #5255: bounded retries + full S3 ERROR logging live inside setHasResults.
  await setHasResults({
    Key,
    bucket,
    now: opts.now,
    // FR #5265: remember this searchid so monitor clear + recheck do not loop.
    promotedsearchid: wantSid,
    headObject: opts.headObject,
    getObject: opts.getObject,
    copyObject: opts.copyObject,
    putObject: opts.putObject,
    getObjectTagging: opts.getObjectTagging,
    putObjectTagging: opts.putObjectTagging,
    logError: opts.logError,
    maxAttempts: opts.hasResultsMaxAttempts,
    retryDelayMs: opts.hasResultsRetryDelayMs,
    sleep: opts.sleep,
  });
  return { hasresults: true };
}

/**
 * @param {number} ms
 * @param {(ms: number) => Promise<void>|void} [sleepFn]
 */
async function sleepMs(ms, sleepFn) {
  if (typeof sleepFn === 'function') {
    await sleepFn(ms);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Write one DONE record then maybe flip hasresults.
 * Fail-soft on DONE path (do not fail the search to DLQ for a flip miss).
 * FR #5142: one short re-check when the first pass sees a missing sibling DONE
 * (last-writer race / rclone lag); log flip failures at ERROR (not silent).
 */
async function recordSearchTerminal(opts) {
  const written = await writeSearchDoneRecord(opts);
  if (written.skipped) {
    return { hasresults: false, written, flip: { hasresults: false, reason: written.skipped } };
  }
  try {
    let flip = await maybeSetHasResults(opts);
    // FR #5142: if a sibling DONE is briefly missing, wait and re-check once.
    if (
      !flip.hasresults &&
      flip.reason &&
      String(flip.reason).startsWith('missing:')
    ) {
      const delayMs =
        opts.recheckDelayMs != null ? Number(opts.recheckDelayMs) : 750;
      if (delayMs > 0) {
        await sleepMs(delayMs, opts.sleep);
        flip = await maybeSetHasResults(opts);
        if (flip.hasresults) {
          flip.reason = flip.reason || 'recheck_ok';
          flip.rechecked = true;
        }
      }
    }
    return { hasresults: !!flip.hasresults, written, flip };
  } catch (err) {
    // FR #5255: log code/message/requestId/bucket/key (setHasResults already
    // ERROR-logs each attempt; this is the terminal flip miss).
    const e = err && typeof err === 'object' ? err : {};
    const meta = e.$metadata || {};
    const detail = [
      e.name || e.code || e.Code || '',
      String((e && e.message) || err || ''),
      meta.requestId || '',
      opts.bucket || resolveAClubsBucket(opts.envVars || process.env),
      opts.hostkey && opts.guid ? `${opts.hostkey}/${opts.guid}/` : '',
    ]
      .filter(Boolean)
      .join(' ');
    if (typeof opts.logError === 'function') {
      opts.logError(
        '[a-search]',
        'ERROR',
        'hasresults_flip_failed',
        detail || String((err && err.message) || err),
      );
    } else if (typeof console !== 'undefined' && console.error) {
      console.error(
        '[a-search]',
        'ERROR',
        'hasresults_flip_failed',
        detail || String((err && err.message) || err),
      );
    }
    return { hasresults: false, written, flip: { hasresults: false, reason: 'flip_error' } };
  }
}

module.exports = {
  SEARCH_DONE_PREFIX,
  doneObjectKey,
  legacyDoneObjectKey,
  bodyToBuffer,
  writeSearchDoneRecord,
  maybeSetHasResults,
  recordSearchTerminal,
  loadFanout,
  doneExists,
};
