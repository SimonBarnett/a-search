'use strict';

/**
 * FR #4917: per-(searchid, source) DONE records under a-clubs/{host}/{guid}/DONE/
 * and flip GUID marker hasresults=1 when every fan-out queued source is terminal
 * (serviced or dlq). Stale searchid records are ignored.
 */

const { setHasResults } = require('../widgets/hostFolderMeta');

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
 * @param {string} hostkey
 * @param {string} guid
 * @param {string} searchid
 * @param {string} source
 * @returns {string}
 */
function doneObjectKey(hostkey, guid, searchid, source) {
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
  const bodyObj = { searchid, source, status, products, at };
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
async function doneExists(opts, source) {
  const hostkey = String(opts.hostkey || '').trim();
  const guid = String(opts.guid || '').trim();
  const searchid = String(opts.searchid || '').trim();
  const src = String(source || '')
    .trim()
    .toLowerCase();
  const bucket =
    opts.bucket || resolveAClubsBucket(opts.envVars || process.env);
  const Key = doneObjectKey(hostkey, guid, searchid, src);
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

/**
 * Compare DONE set for fan-out searchid vs queued; set hasresults=1 when complete.
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
  await setHasResults({
    Key,
    bucket,
    now: opts.now,
    headObject: opts.headObject,
    getObject: opts.getObject,
    copyObject: opts.copyObject,
    putObject: opts.putObject,
    getObjectTagging: opts.getObjectTagging,
    putObjectTagging: opts.putObjectTagging,
  });
  return { hasresults: true };
}

/**
 * Write one DONE record then maybe flip hasresults.
 * Fail-soft: DONE write errors are logged via opts.logError when provided.
 */
async function recordSearchTerminal(opts) {
  const written = await writeSearchDoneRecord(opts);
  if (written.skipped) {
    return { hasresults: false, written, flip: { hasresults: false, reason: written.skipped } };
  }
  try {
    const flip = await maybeSetHasResults(opts);
    return { hasresults: !!flip.hasresults, written, flip };
  } catch (err) {
    if (typeof opts.logError === 'function') {
      opts.logError('[a-search]', 'WARN', 'hasresults_flip_failed', String(err && err.message || err));
    }
    return { hasresults: false, written, flip: { hasresults: false, reason: 'flip_error' } };
  }
}

module.exports = {
  doneObjectKey,
  writeSearchDoneRecord,
  maybeSetHasResults,
  recordSearchTerminal,
  loadFanout,
};
