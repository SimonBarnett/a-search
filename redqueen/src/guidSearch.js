'use strict';

/**
 * FR #4265: after a GUID review is annotated, write searches.json and POST /search.
 * Keeps existing exclude[]. Does not log secrets.
 */

const fs = require('node:fs');
const {
  queryCap,
  boundQueries,
  isFullTier,
} = require('../../shared/widgets/agentWidgetContext');
const {
  keywordsOnly,
  normalizeMarketCurrency,
} = require('../../shared/search/cleanSearchQuery');
const {
  searchesContentHash,
  shouldPostSearch,
} = require('../../shared/aClubs/searchesHash');
const { PAGE_SCHEMA } = require('./annotationSchemas');

function searchesObjectKey(hostkey, guid) {
  const host = String(hostkey).replace(/\/+$/, '');
  const id = String(guid).trim().toLowerCase();
  return `${host}/${id}/searches.json`;
}

function isFullTierMeta(md) {
  const meta = md || {};
  const upgradedRaw = String(meta.upgraded || '').trim().toLowerCase();
  const upgraded = upgradedRaw === '1' || upgradedRaw === 'true' || upgradedRaw === 'yes';
  return isFullTier({ upgraded, layout: meta.layout });
}

async function readJsonObject(opts, Key) {
  if (!opts || typeof opts.getObject !== 'function') return null;
  try {
    const obj = await opts.getObject({ Key });
    let text = '';
    const body = obj && obj.Body;
    if (Buffer.isBuffer(body)) text = body.toString('utf8');
    else if (typeof body === 'string') text = body;
    else if (body && typeof body.transformToString === 'function') {
      text = await body.transformToString();
    } else if (body != null) text = String(body);
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    const status = err && err.$metadata && err.$metadata.httpStatusCode;
    const code = err && (err.name || err.code);
    if (
      status === 404 ||
      code === 'NotFound' ||
      code === 'NoSuchKey' ||
      code === 'NoSuchAnnotation'
    ) {
      return null;
    }
    if (err instanceof SyntaxError) return null;
    throw err;
  }
}

function asQueryRows(list) {
  const rows = [];
  const items = Array.isArray(list) ? list : [];
  for (const q of items) {
    if (typeof q === 'string') {
      const text = q.trim();
      if (text) rows.push({ q: text, intent: 'page', maxResults: 10 });
      continue;
    }
    if (q && typeof q === 'object') rows.push(q);
  }
  return rows;
}

function steeringExclude(steering, now) {
  const s = steering && typeof steering === 'object' ? steering : {};
  const raw = s.exclude || s.excludeTerms || [];
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item of list) {
    if (item && typeof item === 'object') {
      const row = {
        reason: item.reason ? String(item.reason) : 'steering',
        at: item.at ? String(item.at) : now,
      };
      if (item.partId != null && String(item.partId).trim()) row.partId = String(item.partId).trim();
      if (item.match != null && String(item.match).trim()) {
        const match = String(item.match).trim();
        if (match.length >= 3) row.match = match;
      }
      if (item.otherText != null && String(item.otherText).trim()) {
        row.otherText = String(item.otherText).trim();
      }
      out.push(row);
      continue;
    }
    const match = String(item || '').trim();
    if (!match || match.length < 3) continue;
    out.push({ match, reason: 'steering', at: now });
  }
  return out;
}

function mergeExclude(existing, extra) {
  const out = Array.isArray(existing) ? existing.slice() : [];
  const keyOf = (e) =>
    `${(e && e.partId) || ''}|${(e && e.match) || ''}|${(e && e.reason) || ''}`;
  const seen = new Set(out.map(keyOf));
  for (const row of extra || []) {
    const k = keyOf(row);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

/**
 * @param {{
 *   review?: object,
 *   steering?: object,
 *   existing?: object,
 *   fullTier?: boolean,
 *   now?: string,
 * }} input
 */
function buildSearchesDoc(input) {
  const review = input.review || {};
  const steering = input.steering && typeof input.steering === 'object' ? input.steering : {};
  const existing = input.existing && typeof input.existing === 'object' ? input.existing : {};
  const now = input.now || new Date().toISOString();
  const cap = queryCap(!!input.fullTier);
  const page = input.page && input.page.schema === PAGE_SCHEMA ? input.page : null;
  const host = input.host && typeof input.host === 'object' ? input.host : null;
  let queries;
  if (page) {
    const fromPage = asQueryRows(page.search_queries);
    const models = ((page.selection && page.selection.models) || []).map((m) =>
      [m.brand, m.model, m.sku].filter(Boolean).join(' '),
    );
    const types = (page.selection && page.selection.product_types) || [];
    queries = boundQueries([...fromPage, ...asQueryRows(models), ...asQueryRows(types)], cap);
  } else {
    const suggested = asQueryRows(review.suggestedQueries);
    const include = asQueryRows(steering.include || steering.includeTerms || steering.queries);
    queries = boundQueries([...suggested, ...include], cap);
    if (!queries.length) {
      const intent = review.intent ? String(review.intent).trim() : '';
      const summary = review.summary ? String(review.summary).trim() : '';
      const seed = intent || (summary.split(/[.\n]/)[0] || '').trim();
      queries = boundQueries(asQueryRows(seed ? [seed] : []), cap);
    }
  }
  const hostMarket = host && host.market ? host.market : {};
  const { market, currency } = normalizeMarketCurrency({
    market: hostMarket.country || steering.market || existing.market || '',
    currency: hostMarket.currency || steering.currency || existing.currency || '',
  });
  const stripMarket = market || String(steering.market || existing.market || '');
  const stripCurrency = currency || String(steering.currency || existing.currency || '');
  queries = queries
    .map((q) => ({
      q: keywordsOnly(q.q, stripMarket, stripCurrency),
      intent: q.intent || 'page',
      maxResults: Number.isFinite(Number(q.maxResults)) ? Number(q.maxResults) : 10,
    }))
    .filter((q) => q.q)
    .slice(0, cap);
  const extraEx = [];
  if (host && Array.isArray(host.exclusions)) {
    for (const match of host.exclusions) {
      if (String(match || '').trim().length >= 3) {
        extraEx.push({ match: String(match).trim(), reason: 'host', at: now });
      }
    }
  }
  if (page && page.selection && Array.isArray(page.selection.page_exclusions)) {
    for (const match of page.selection.page_exclusions) {
      if (String(match || '').trim().length >= 3) {
        extraEx.push({ match: String(match).trim(), reason: 'page', at: now });
      }
    }
  }
  extraEx.push(...steeringExclude(steering, now));
  const exclude = mergeExclude(existing.exclude, extraEx).filter(
    (row) => row && (row.partId || (row.match && String(row.match).trim().length >= 3)),
  );
  const doc = { queries, exclude, annotationSchema: PAGE_SCHEMA };
  if (market) doc.market = market;
  if (currency) doc.currency = currency;
  if (existing.searchid) doc.searchid = String(existing.searchid);
  return { doc, cap };
}

function normEtag(etag) {
  return String(etag == null ? '' : etag)
    .replace(/^W\//i, '')
    .replace(/"/g, '')
    .trim()
    .toLowerCase();
}

function rememberEtag(opts, key, etag) {
  if (!etag || !opts || !opts.selfEtags || typeof opts.selfEtags.set !== 'function') return;
  opts.selfEtags.set(String(key), normEtag(etag));
}

async function writeSearches(opts, key, doc) {
  if (typeof opts.putObject !== 'function') {
    const err = new Error('searches_write_failed');
    err.code = 'searches_write_failed';
    throw err;
  }
  const resp = await opts.putObject({
    Key: key,
    Body: Buffer.from(`${JSON.stringify(doc, null, 2)}\n`, 'utf8'),
    ContentType: 'application/json',
  });
  rememberEtag(opts, key, resp && resp.ETag);
}

/**
 * Store searcheshash on the GUID marker so the next edit can be compared.
 * Failures are ignored: the POST already succeeded.
 * @param {object} opts
 * @param {string} hostkey
 * @param {string} guid
 * @param {string} hash
 */
async function writeMarkerSearchesHash(opts, hostkey, guid, hash) {
  if (!hash || typeof opts.copyObject !== 'function' || typeof opts.headObject !== 'function') {
    return;
  }
  const Key = `${String(hostkey).replace(/\/+$/, '')}/${String(guid).toLowerCase()}/`;
  let prev = {};
  try {
    const head = await opts.headObject({ Key });
    prev = (head && (head.Metadata || head.metadata)) || {};
  } catch {
    return;
  }
  const Metadata = {};
  const names = Object.keys(prev);
  for (let i = 0; i < names.length; i += 1) {
    Metadata[names[i]] = String(prev[names[i]]);
  }
  Metadata.searcheshash = hash;
  const bucket = opts.bucket || process.env.A_CLUBS_BUCKET || 'a-clubs';
  try {
    const resp = await opts.copyObject({
      Key,
      CopySource: `${bucket}/${Key}`,
      Metadata,
      MetadataDirective: 'REPLACE',
    });
    const etag = resp && ((resp.CopyObjectResult && resp.CopyObjectResult.ETag) || resp.ETag);
    rememberEtag(opts, Key, etag);
  } catch {
    // hash is still returned to the caller
  }
}

/**
 * Write searches.json then POST /search. Existing searchid skips the POST.
 * @param {object} opts
 */
async function publishGuidSearch(opts) {
  const key = searchesObjectKey(opts.hostkey, opts.guid);
  const existing = (await readJsonObject(opts, key)) || { queries: [], exclude: [] };
  let markerMeta = opts.metadata || opts.markerMeta;
  if (!markerMeta && typeof opts.headObject === 'function' && opts.hostkey && opts.guid) {
    const markerKey = `${String(opts.hostkey).replace(/\/+$/, '')}/${String(opts.guid).toLowerCase()}/`;
    try {
      const head = await opts.headObject({ Key: markerKey });
      markerMeta = (head && (head.Metadata || head.metadata)) || {};
    } catch {
      markerMeta = {};
    }
  }
  if (!markerMeta) markerMeta = {};
  const existingHash = searchesContentHash({
    queries: Array.isArray(existing.queries) ? existing.queries : [],
    exclude: Array.isArray(existing.exclude) ? existing.exclude : [],
  });
  const postExisting = shouldPostSearch({ doc: existing, markerMeta });
  const schemaOk = existing.annotationSchema === PAGE_SCHEMA;
  // searchid + matching hash (or no stored hash yet) stays quiet unless the
  // stored searches.json is missing PAGE_SCHEMA and a new page review is present.
  if (
    existing.searchid &&
    !postExisting &&
    (schemaOk || opts.repostExisting || !opts.page) &&
    (opts.repostExisting || !opts.review)
  ) {
    return {
      ok: true,
      searchid: String(existing.searchid),
      idempotent: true,
      wrote: false,
      searcheshash: existingHash,
    };
  }
  // FR #4311: annotated GUID already has queries and no searchid. POST that
  // file once. Do not rebuild queries from a new review.
  // FR #4827: hash mismatch with a searchid takes the same path.
  if (opts.repostExisting || (existing.searchid && postExisting && !opts.review)) {
    const queries = Array.isArray(existing.queries) ? existing.queries : [];
    if (!queries.length) {
      // FR #4889: /parts seed (or not-yet-annotated GUID) has empty queries.
      // Never POST /search; never throw (that retried into a-clubs-changes-dlq).
      return {
        ok: true,
        idempotent: true,
        wrote: false,
        skipped: true,
        reason: 'searches_empty_seed',
      };
    }
    const exclude = Array.isArray(existing.exclude) ? existing.exclude : [];
    const posted = await postSearchBody(opts, {
      hostkey: opts.hostkey,
      guid: opts.guid,
      queries,
      exclude,
      market: existing.market,
      currency: existing.currency,
    });
    const doc = { queries, exclude, searchid: posted.searchid, annotationSchema: PAGE_SCHEMA };
    if (existing.market) doc.market = String(existing.market);
    if (existing.currency) doc.currency = String(existing.currency);
    const postedHash = searchesContentHash({ queries, exclude });
    await writeSearches(opts, key, doc);
    await writeMarkerSearchesHash(opts, opts.hostkey, opts.guid, postedHash);
    return {
      ok: true,
      searchid: posted.searchid,
      idempotent: !!posted.idempotent,
      wrote: true,
      reposted: true,
      searcheshash: postedHash,
    };
  }
  const { doc, cap } = buildSearchesDoc({
    review: opts.review,
    steering: opts.steering,
    existing,
    page: opts.page,
    host: opts.host,
    fullTier: isFullTierMeta(opts.metadata),
    now: opts.now,
  });
  if (!doc.queries.length) {
    const err = new Error('searches_empty');
    err.code = 'searches_empty';
    throw err;
  }
  if (doc.queries.length > cap) {
    const err = new Error('searches_over_cap');
    err.code = 'searches_over_cap';
    throw err;
  }
  const newHash = searchesContentHash({ queries: doc.queries, exclude: doc.exclude });
  if (existing.searchid && newHash === existingHash && !postExisting) {
    return {
      ok: true,
      searchid: String(existing.searchid),
      idempotent: true,
      wrote: false,
      searcheshash: newHash,
    };
  }
  await writeSearches(opts, key, doc);
  const posted = await postSearchBody(opts, {
    hostkey: opts.hostkey,
    guid: opts.guid,
    queries: doc.queries,
    exclude: doc.exclude,
    market: doc.market,
    currency: doc.currency,
  });
  doc.searchid = posted.searchid;
  await writeSearches(opts, key, doc);
  await writeMarkerSearchesHash(opts, opts.hostkey, opts.guid, newHash);
  return {
    ok: true,
    searchid: posted.searchid,
    idempotent: !!posted.idempotent,
    wrote: true,
    searcheshash: newHash,
  };
}

async function postSearchBody(opts, body) {
  const post = opts.postSearch;
  if (typeof post !== 'function') {
    const err = new Error('search_not_configured');
    err.code = 'search_not_configured';
    throw err;
  }
  let resp;
  try {
    resp = await post(body);
  } catch (err) {
    const wrapped = new Error(`search_post_failed:${(err && err.message) || err}`);
    wrapped.code = 'search_post_failed';
    throw wrapped;
  }
  const status = resp && resp.status;
  if (!resp || resp.ok === false || (status && status >= 300)) {
    const err = new Error(`search_post_failed:${(resp && (resp.detail || resp.status)) || 'bad'}`);
    err.code = 'search_post_failed';
    throw err;
  }
  const searchid = resp.searchid ? String(resp.searchid) : '';
  if (!searchid) {
    const err = new Error('search_post_failed:no_searchid');
    err.code = 'search_post_failed';
    throw err;
  }
  return { searchid, idempotent: !!(resp && resp.idempotent) };
}

/** 'idempotent' | 'repost' | 'missing' for an existing searches.json. */
async function guidSearchState(opts, hostkey, guid) {
  const existing = await readJsonObject(opts, searchesObjectKey(hostkey, guid));
  if (existing && existing.searchid) {
    const meta = (opts && (opts.markerMeta || opts.metadata)) || {};
    if (shouldPostSearch({ doc: existing, markerMeta: meta })) return 'repost';
    return 'idempotent';
  }
  if (existing && Array.isArray(existing.queries) && existing.queries.length) return 'repost';
  return 'missing';
}

/**
 * Unit-test stand-in when the caller does not inject postSearch.
 * Production run.js passes createHttpPostSearch.
 */
function localPostSearchAck() {
  return async () => ({ ok: true, status: 202, searchid: 'srch_local' });
}

function readAgentKey(env) {
  const direct = env.A_SEARCH_AGENT_API_KEY != null ? String(env.A_SEARCH_AGENT_API_KEY) : '';
  if (direct.trim()) return direct.trim();
  const file = env.A_SEARCH_AGENT_API_KEY_FILE
    ? String(env.A_SEARCH_AGENT_API_KEY_FILE).trim()
    : '';
  if (!file) return '';
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

/**
 * POST {base}/search with the agent key. Never logs the key or the body.
 * @param {NodeJS.ProcessEnv} [env]
 */
function createHttpPostSearch(env = process.env) {
  return async function postSearch(body) {
    const base = String(env.A_SEARCH_API_URL || '').trim().replace(/\/+$/, '');
    const key = readAgentKey(env);
    if (!base || !key) {
      const err = new Error('search_not_configured');
      err.code = 'search_not_configured';
      throw err;
    }
    const fetchImpl = typeof env.fetchImpl === 'function' ? env.fetchImpl : globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      const err = new Error('search_not_configured');
      err.code = 'search_not_configured';
      throw err;
    }
    const res = await fetchImpl(`${base}/search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-api-key': key,
      },
      body: JSON.stringify({
        hostkey: body.hostkey,
        guid: body.guid,
        queries: body.queries,
        exclude: body.exclude || [],
        ...(body.market ? { market: body.market } : {}),
        ...(body.currency ? { currency: body.currency } : {}),
      }),
    });
    let parsed = {};
    try {
      parsed = await res.json();
    } catch {
      parsed = {};
    }
    return {
      ok: res.ok,
      status: res.status,
      searchid: parsed && parsed.searchid,
      queued: parsed && parsed.queued,
      idempotent: !!(parsed && parsed.idempotent),
    };
  };
}

module.exports = {
  searchesObjectKey,
  buildSearchesDoc,
  keywordsOnly,
  publishGuidSearch,
  guidSearchState,
  readJsonObject,
  localPostSearchAck,
  createHttpPostSearch,
  isFullTierMeta,
  searchesContentHash,
  shouldPostSearch,
  writeMarkerSearchesHash,
};
