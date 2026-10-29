'use strict';

/**
 * FR #5047: when hasresults completes and live.json has 0 parts, record a
 * no-results signal on the GUID and upsert a sector ledger for affiliate /
 * merchant agents ("need more vendors in sector X"). Not an error; no retry.
 */

const LEDGER_SCHEMA = 'a-clubs.need-vendors.v1';
const SIGNAL_SCHEMA = 'a-clubs.no-results.v1';
const LEDGER_KEY = '_ops/need-vendors-by-sector.json';
const MAX_EXAMPLE_QUERIES = 20;
const MAX_PAGES = 20;

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
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeSector(raw) {
  return String(raw == null ? '' : raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

/**
 * Prefer page product_types, then host affiliate category, then query text.
 * @param {{
 *   pageAnn?: object|null,
 *   hostAnn?: object|null,
 *   queries?: Array<string|{q?: string, intent?: string}>,
 * }} input
 * @returns {string}
 */
function extractSectorHint(input) {
  const page = input && input.pageAnn;
  const host = input && input.hostAnn;
  const types =
    page && page.selection && Array.isArray(page.selection.product_types)
      ? page.selection.product_types
      : [];
  for (const t of types) {
    const n = normalizeSector(t);
    if (n) return n;
  }
  const opps =
    host && Array.isArray(host.affiliate_opportunities)
      ? host.affiliate_opportunities
      : [];
  for (const row of opps) {
    const n = normalizeSector(row && row.category);
    if (n) return n;
  }
  const queries = Array.isArray(input && input.queries) ? input.queries : [];
  for (const q of queries) {
    if (q && typeof q === 'object') {
      const intent = normalizeSector(q.intent);
      if (intent && intent !== 'page') return intent;
      const qq = normalizeSector(q.q);
      if (qq) return qq.split(' ').slice(0, 4).join(' ');
    } else {
      const qq = normalizeSector(q);
      if (qq) return qq.split(' ').slice(0, 4).join(' ');
    }
  }
  return 'unknown';
}

/**
 * @param {unknown} queries
 * @returns {string[]}
 */
function flattenQueries(queries) {
  if (!Array.isArray(queries)) return [];
  /** @type {string[]} */
  const out = [];
  for (const q of queries) {
    if (typeof q === 'string') {
      const s = q.trim();
      if (s) out.push(s);
    } else if (q && typeof q === 'object' && q.q != null) {
      const s = String(q.q).trim();
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * @param {{
 *   host: string,
 *   guid: string,
 *   searchid?: string,
 *   queries?: unknown[],
 *   sector?: string,
 *   partCount?: number,
 *   at?: string,
 * }} input
 */
function buildNoResultsSignal(input) {
  const host = String((input && input.host) || '').trim();
  const guid = String((input && input.guid) || '').trim().toLowerCase();
  const sector = normalizeSector(input && input.sector) || 'unknown';
  const at =
    input && input.at
      ? String(input.at)
      : new Date().toISOString();
  const queries = flattenQueries(input && input.queries);
  const partCount = Number.isFinite(Number(input && input.partCount))
    ? Math.max(0, Math.floor(Number(input.partCount)))
    : 0;
  const signal = {
    schema: SIGNAL_SCHEMA,
    host,
    guid,
    searchid: String((input && input.searchid) || '').trim() || null,
    queries,
    sector,
    message: `need more vendors in sector ${sector}`,
    partCount,
    at,
  };
  return signal;
}

/**
 * Upsert one signal into the sector ledger (count++, merge queries/pages).
 * @param {object|null|undefined} existing
 * @param {ReturnType<typeof buildNoResultsSignal>} signal
 * @returns {object}
 */
function upsertSectorLedger(existing, signal) {
  const sector = normalizeSector(signal && signal.sector) || 'unknown';
  const at = String((signal && signal.at) || new Date().toISOString());
  const base =
    existing && typeof existing === 'object' && existing.schema === LEDGER_SCHEMA
      ? existing
      : { schema: LEDGER_SCHEMA, updatedAt: at, sectors: {} };
  const sectors =
    base.sectors && typeof base.sectors === 'object' ? { ...base.sectors } : {};
  const prev = sectors[sector] && typeof sectors[sector] === 'object'
    ? sectors[sector]
    : null;
  /** @type {string[]} */
  const exampleQueries = Array.isArray(prev && prev.exampleQueries)
    ? prev.exampleQueries.slice()
    : [];
  for (const q of flattenQueries(signal && signal.queries)) {
    if (!exampleQueries.includes(q) && exampleQueries.length < MAX_EXAMPLE_QUERIES) {
      exampleQueries.push(q);
    }
  }
  /** @type {Array<{host: string, guid: string, at: string}>} */
  const pages = Array.isArray(prev && prev.pages) ? prev.pages.slice() : [];
  const host = String((signal && signal.host) || '').trim();
  const guid = String((signal && signal.guid) || '').trim().toLowerCase();
  const pageKey = `${host}|${guid}`;
  const already = pages.some(
    (p) => `${String(p.host || '')}|${String(p.guid || '').toLowerCase()}` === pageKey,
  );
  if (!already && pages.length < MAX_PAGES && host && guid) {
    pages.push({ host, guid, at });
  }
  const count = (prev && Number.isFinite(Number(prev.count)) ? Number(prev.count) : 0) + 1;
  sectors[sector] = {
    sector,
    count,
    message: `need more vendors in sector ${sector}`,
    exampleQueries,
    pages,
    firstAt: (prev && prev.firstAt) || at,
    lastAt: at,
  };
  return {
    schema: LEDGER_SCHEMA,
    updatedAt: at,
    sectors,
  };
}

/**
 * @param {string} host
 * @param {string} guid
 * @returns {string}
 */
function noResultsSignalKey(host, guid) {
  return `${String(host).trim()}/${String(guid).trim().toLowerCase()}/feedback/no-results.json`;
}

/**
 * @returns {string}
 */
function sectorLedgerKey() {
  return LEDGER_KEY;
}

/**
 * Soft-read JSON object from S3; missing => null.
 * @param {{ getObject?: Function, bucket?: string, Key: string }} opts
 */
async function getJsonObject(opts) {
  if (!opts || typeof opts.getObject !== 'function') return null;
  try {
    const args = { Key: opts.Key };
    if (opts.bucket) args.Bucket = opts.bucket;
    const out = await opts.getObject(args);
    const raw = (await bodyToBuffer(out && out.Body)).toString('utf8').trim();
    if (!raw) return null;
    const doc = JSON.parse(raw);
    return doc && typeof doc === 'object' ? doc : null;
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
 * Soft-read annotation via getObjectAnnotation or null.
 * @param {{ getObjectAnnotation?: Function, Key: string }} opts
 */
async function getAnnotation(opts) {
  if (!opts || typeof opts.getObjectAnnotation !== 'function') return null;
  try {
    const resp = await opts.getObjectAnnotation({
      Key: opts.Key,
      AnnotationName: 'annotation',
    });
    let body =
      resp && (resp.AnnotationPayload != null ? resp.AnnotationPayload : resp.Body);
    if (body && typeof body.transformToString === 'function') {
      body = await body.transformToString();
    }
    const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '');
    const obj = JSON.parse(text);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

/**
 * When live is empty after hasresults promote, write GUID signal + sector ledger.
 * Fail-soft: never throws to the hasresults path.
 * @param {{
 *   host: string,
 *   guid: string,
 *   searchid?: string,
 *   live?: object[],
 *   partCount?: number,
 *   bucket?: string,
 *   now?: Date|string|number,
 *   putObject: Function,
 *   getObject?: Function,
 *   getObjectAnnotation?: Function,
 *   logError?: Function,
 * }} opts
 * @returns {Promise<{
 *   recorded: boolean,
 *   reason?: string,
 *   signal?: object,
 *   signalKey?: string,
 *   ledgerKey?: string,
 * }>}
 */
async function recordNoResultsIfEmpty(opts) {
  try {
    if (!opts || typeof opts.putObject !== 'function') {
      return { recorded: false, reason: 'missing_putObject' };
    }
    const host = String(opts.host || '').trim();
    const guid = String(opts.guid || '').trim().toLowerCase();
    if (!host || !guid) return { recorded: false, reason: 'missing_path' };

    let partCount = opts.partCount;
    if (partCount == null && Array.isArray(opts.live)) {
      partCount = opts.live.length;
    }
    if (partCount == null && typeof opts.getObject === 'function') {
      const liveDoc = await getJsonObject({
        getObject: opts.getObject,
        bucket: opts.bucket,
        Key: `${host}/${guid}/live.json`,
      });
      partCount = Array.isArray(liveDoc) ? liveDoc.length : 0;
    }
    partCount = Number.isFinite(Number(partCount))
      ? Math.max(0, Math.floor(Number(partCount)))
      : 0;
    if (partCount > 0) {
      return { recorded: false, reason: 'has_parts', partCount };
    }

    const searches = await getJsonObject({
      getObject: opts.getObject,
      bucket: opts.bucket,
      Key: `${host}/${guid}/searches.json`,
    });
    const queries = searches && Array.isArray(searches.queries) ? searches.queries : [];
    const pageAnn = await getAnnotation({
      getObjectAnnotation: opts.getObjectAnnotation,
      Key: `${host}/${guid}/`,
    });
    const hostAnn = await getAnnotation({
      getObjectAnnotation: opts.getObjectAnnotation,
      Key: `${host}/`,
    });
    const sector = extractSectorHint({ pageAnn, hostAnn, queries });
    const at =
      opts.now == null
        ? new Date().toISOString()
        : opts.now instanceof Date
          ? opts.now.toISOString()
          : String(opts.now);
    const signal = buildNoResultsSignal({
      host,
      guid,
      searchid: opts.searchid || (searches && searches.searchid) || '',
      queries,
      sector,
      partCount: 0,
      at,
    });
    const signalKey = noResultsSignalKey(host, guid);
    const signalBody = Buffer.from(`${JSON.stringify(signal, null, 2)}\n`, 'utf8');
    const signalPut = { Key: signalKey, Body: signalBody, ContentType: 'application/json; charset=utf-8' };
    if (opts.bucket) signalPut.Bucket = opts.bucket;
    await opts.putObject(signalPut);

    const ledgerKey = sectorLedgerKey();
    const existing = await getJsonObject({
      getObject: opts.getObject,
      bucket: opts.bucket,
      Key: ledgerKey,
    });
    const ledger = upsertSectorLedger(existing, signal);
    const ledgerBody = Buffer.from(`${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
    const ledgerPut = { Key: ledgerKey, Body: ledgerBody, ContentType: 'application/json; charset=utf-8' };
    if (opts.bucket) ledgerPut.Bucket = opts.bucket;
    await opts.putObject(ledgerPut);

    return {
      recorded: true,
      signal,
      signalKey,
      ledgerKey,
      sector,
    };
  } catch (err) {
    if (typeof opts.logError === 'function') {
      opts.logError(
        '[a-search]',
        'WARN',
        'no_results_feedback_failed',
        String((err && err.message) || err),
      );
    }
    return {
      recorded: false,
      reason: 'error',
      error: String((err && err.message) || err),
    };
  }
}

module.exports = {
  LEDGER_SCHEMA,
  SIGNAL_SCHEMA,
  LEDGER_KEY,
  normalizeSector,
  extractSectorHint,
  flattenQueries,
  buildNoResultsSignal,
  upsertSectorLedger,
  noResultsSignalKey,
  sectorLedgerKey,
  recordNoResultsIfEmpty,
};
