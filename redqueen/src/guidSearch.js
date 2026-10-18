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

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * FR #4318: q is product keywords. Market, currency and postcodes are not keywords.
 * @param {string} text
 * @param {string} market
 * @param {string} currency
 */
function keywordsOnly(text, market, currency) {
  let q = String(text || '');
  for (const phrase of [market, currency]) {
    const p = String(phrase || '').trim();
    if (p.length < 2) continue;
    const escaped = escapeRegExp(p);
    const re = /\s|[()]/.test(p) || p.length > 3
      ? new RegExp(escaped, 'ig')
      : new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:[^A-Za-z0-9]|$)`, 'ig');
    q = q.replace(re, ' ');
  }
  q = q.replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, ' ');
  return q.replace(/\s+/g, ' ').trim();
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
  const suggested = asQueryRows(review.suggestedQueries);
  const include = asQueryRows(steering.include || steering.includeTerms || steering.queries);
  let queries = boundQueries([...suggested, ...include], cap);
  if (!queries.length) {
    const intent = review.intent ? String(review.intent).trim() : '';
    const summary = review.summary ? String(review.summary).trim() : '';
    const seed = intent || (summary.split(/[.\n]/)[0] || '').trim();
    queries = boundQueries(asQueryRows(seed ? [seed] : []), cap);
  }
  const market = steering.market ? String(steering.market).trim() : '';
  const currency = steering.currency ? String(steering.currency).trim() : '';
  queries = queries
    .map((q) => ({
      q: keywordsOnly(q.q, market, currency),
      intent: q.intent || 'page',
      maxResults: Number.isFinite(Number(q.maxResults)) ? Number(q.maxResults) : 10,
    }))
    .filter((q) => q.q)
    .slice(0, cap);
  const exclude = mergeExclude(existing.exclude, steeringExclude(steering, now)).filter(
    (row) => row && (row.partId || (row.match && String(row.match).trim().length >= 3)),
  );
  const doc = { queries, exclude };
  if (market) doc.market = market;
  if (currency) doc.currency = currency;
  if (existing.searchid) doc.searchid = String(existing.searchid);
  return { doc, cap };
}

async function writeSearches(opts, key, doc) {
  if (typeof opts.putObject !== 'function') {
    const err = new Error('searches_write_failed');
    err.code = 'searches_write_failed';
    throw err;
  }
  await opts.putObject({
    Key: key,
    Body: Buffer.from(`${JSON.stringify(doc, null, 2)}\n`, 'utf8'),
    ContentType: 'application/json',
  });
}

/**
 * Write searches.json then POST /search. Existing searchid skips the POST.
 * @param {object} opts
 */
async function publishGuidSearch(opts) {
  const key = searchesObjectKey(opts.hostkey, opts.guid);
  const existing = (await readJsonObject(opts, key)) || { queries: [], exclude: [] };
  if (existing.searchid) {
    return {
      ok: true,
      searchid: String(existing.searchid),
      idempotent: true,
      wrote: false,
    };
  }
  // FR #4311: annotated GUID already has queries and no searchid. POST that
  // file once. Do not rebuild queries from a new review.
  if (opts.repostExisting) {
    const queries = Array.isArray(existing.queries) ? existing.queries : [];
    if (!queries.length) {
      const err = new Error('searches_missing');
      err.code = 'searches_missing';
      throw err;
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
    const doc = { queries, exclude, searchid: posted.searchid };
    if (existing.market) doc.market = String(existing.market);
    if (existing.currency) doc.currency = String(existing.currency);
    await writeSearches(opts, key, doc);
    return {
      ok: true,
      searchid: posted.searchid,
      idempotent: !!posted.idempotent,
      wrote: true,
      reposted: true,
    };
  }
  const { doc, cap } = buildSearchesDoc({
    review: opts.review,
    steering: opts.steering,
    existing,
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
  return { ok: true, searchid: posted.searchid, idempotent: !!posted.idempotent, wrote: true };
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
  if (existing && existing.searchid) return 'idempotent';
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
};
