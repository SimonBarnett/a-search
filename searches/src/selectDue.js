'use strict';

/**
 * FR #4916: pick a-clubs GUID folders due for hourly re-search.
 * Age: club host defaultage → a-clubs/_root/ (shared/defaultAge.js).
 * Clock: GUID marker lastsearch, else search-fanout.json `at`.
 */

const {
  resolveDefaultAge,
  isDueByLastSearch,
  coerceMeta,
  ensureRootDefaultAge,
  NeedsDefaultAgeError,
} = require('../../shared/defaultAge');

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {string} name
 * @returns {boolean}
 */
function isGuidFolder(name) {
  return GUID_RE.test(String(name || '').trim());
}

/**
 * @param {object} s3 minimal { listObjectsV2, headObject, getObject, putObject }
 * @param {string} bucket
 * @param {{ now?: Date, log?: Function }} [opts]
 * @returns {Promise<{ due: Array<{hostkey:string,guid:string,defaultage:number}>, skipped: number, warnings: string[] }>}
 */
async function selectDueGuidSearches(s3, bucket, opts) {
  const log = (opts && opts.log) || (() => {});
  const now = (opts && opts.now) || new Date();
  const warnings = [];
  const due = [];
  let skipped = 0;

  const rootMeta = await ensureRootDefaultAge(s3, bucket, {
    log: (m) => log(String(m)),
    rootKey: '_root/',
    name: 'a-clubs',
  });

  const listed = await listHostKeys(s3, bucket);
  for (const hostkey of listed) {
    let hostMeta = {};
    try {
      const head = await s3.headObject({ Bucket: bucket, Key: `${hostkey}/` });
      hostMeta = coerceMeta(head.Metadata);
    } catch (err) {
      warnings.push(`host_head_failed:${hostkey}`);
      continue;
    }
    if (String(hostMeta.enabled || '1') === '0') {
      skipped += 1;
      continue;
    }
    if (String(hostMeta.annotated || '') === '0') {
      skipped += 1;
      continue;
    }

    let days;
    try {
      days = resolveDefaultAge({
        merchantMeta: hostMeta,
        rootMeta,
      });
    } catch (err) {
      if (err && err.code === 'needs_defaultage') throw err;
      throw err;
    }

    const guids = await listGuidKeys(s3, bucket, hostkey);
    for (const guid of guids) {
      let guidMeta = {};
      try {
        const head = await s3.headObject({
          Bucket: bucket,
          Key: `${hostkey}/${guid}/`,
        });
        guidMeta = coerceMeta(head.Metadata);
      } catch (_) {
        skipped += 1;
        continue;
      }
      if (String(guidMeta.enabled || '1') === '0') {
        skipped += 1;
        continue;
      }

      // Prefer marker lastsearch; else fan-out `at`.
      let clockMeta = guidMeta;
      if (!String(guidMeta.lastsearch || '').trim()) {
        const at = await readFanoutAt(s3, bucket, hostkey, guid);
        if (at) clockMeta = { ...guidMeta, lastsearch: at };
      }

      if (!isDueByLastSearch(clockMeta, now, days)) {
        skipped += 1;
        continue;
      }

      // Skip empty / seed searches.json (queries: []).
      const searches = await readSearchesJson(s3, bucket, hostkey, guid);
      if (!searches || !Array.isArray(searches.queries) || searches.queries.length === 0) {
        skipped += 1;
        continue;
      }

      due.push({ hostkey, guid, defaultage: days });
    }
  }

  return { due, skipped, warnings };
}

/**
 * @param {object} s3
 * @param {string} bucket
 * @returns {Promise<string[]>}
 */
async function listHostKeys(s3, bucket) {
  const out = [];
  let token;
  do {
    const resp = await s3.listObjectsV2({
      Bucket: bucket,
      Delimiter: '/',
      ContinuationToken: token,
    });
    for (const p of resp.CommonPrefixes || []) {
      const pref = String(p.Prefix || '').replace(/\/+$/, '');
      if (!pref || pref === '_root') continue;
      out.push(pref);
    }
    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/**
 * @param {object} s3
 * @param {string} bucket
 * @param {string} hostkey
 * @returns {Promise<string[]>}
 */
async function listGuidKeys(s3, bucket, hostkey) {
  const out = [];
  let token;
  const prefix = `${hostkey}/`;
  do {
    const resp = await s3.listObjectsV2({
      Bucket: bucket,
      Prefix: prefix,
      Delimiter: '/',
      ContinuationToken: token,
    });
    for (const p of resp.CommonPrefixes || []) {
      const pref = String(p.Prefix || '');
      const name = pref.slice(prefix.length).replace(/\/+$/, '');
      if (isGuidFolder(name)) out.push(name.toLowerCase());
    }
    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/**
 * @param {object} s3
 * @param {string} bucket
 * @param {string} hostkey
 * @param {string} guid
 * @returns {Promise<string|null>}
 */
async function readFanoutAt(s3, bucket, hostkey, guid) {
  if (typeof s3.getObject !== 'function') return null;
  try {
    const obj = await s3.getObject({
      Bucket: bucket,
      Key: `${hostkey}/${guid}/search-fanout.json`,
    });
    const body = await streamToString(obj.Body);
    const doc = JSON.parse(body);
    const at = doc && doc.at != null ? String(doc.at).trim() : '';
    return at || null;
  } catch (_) {
    return null;
  }
}

/**
 * @param {object} s3
 * @param {string} bucket
 * @param {string} hostkey
 * @param {string} guid
 * @returns {Promise<object|null>}
 */
async function readSearchesJson(s3, bucket, hostkey, guid) {
  if (typeof s3.getObject !== 'function') return null;
  try {
    const obj = await s3.getObject({
      Bucket: bucket,
      Key: `${hostkey}/${guid}/searches.json`,
    });
    const body = await streamToString(obj.Body);
    return JSON.parse(body);
  } catch (_) {
    return null;
  }
}

/**
 * @param {any} body
 * @returns {Promise<string>}
 */
async function streamToString(body) {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  if (typeof body.transformToString === 'function') {
    return body.transformToString('utf8');
  }
  const chunks = [];
  for await (const c of body) chunks.push(c);
  return Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))).toString(
    'utf8',
  );
}

module.exports = {
  selectDueGuidSearches,
  isGuidFolder,
  NeedsDefaultAgeError,
};
