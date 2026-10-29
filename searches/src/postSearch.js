'use strict';

/**
 * FR #4916: POST /search for one GUID using queries from a-clubs searches.json.
 * IAM SigV4 via scripts/awsExecuteApiSigV4 (FR #4888). Inject postJson in tests.
 */

/**
 * @param {object} s3
 * @param {string} bucket
 * @param {{ hostkey: string, guid: string }} job
 * @returns {Promise<{queries: string[], exclude: string[], market?: string, currency?: string}>}
 */
async function loadSearchesPayload(s3, bucket, job) {
  const obj = await s3.getObject({
    Bucket: bucket,
    Key: `${job.hostkey}/${job.guid}/searches.json`,
  });
  const body = await streamToString(obj.Body);
  const doc = JSON.parse(body);
  const queries = Array.isArray(doc.queries) ? doc.queries : [];
  const exclude = Array.isArray(doc.exclude) ? doc.exclude : [];
  const out = { queries, exclude };
  if (doc.market) out.market = String(doc.market);
  if (doc.currency) out.currency = String(doc.currency);
  // FR #5281: pass selection brands/models through /search body.
  if (Array.isArray(doc.brands) && doc.brands.length) out.brands = doc.brands;
  if (Array.isArray(doc.models) && doc.models.length) out.models = doc.models;
  return out;
}

/**
 * @param {{
 *   s3: object,
 *   bucket?: string,
 *   apiUrl: string,
 *   env?: NodeJS.ProcessEnv,
 *   postJson?: (url: string, body: object) => Promise<object>,
 * }} deps
 * @returns {(job: {hostkey:string,guid:string}) => Promise<{searchid:string,providers_queued:number}>}
 */
function createPostSearchRunner(deps) {
  const bucket = deps.bucket || 'a-clubs';
  const base = String(deps.apiUrl || '').replace(/\/+$/, '');
  const env = deps.env || process.env;
  const postJson =
    deps.postJson ||
    (async (url, body) => {
      const {
        defaultCredentials,
        requireCredentials,
        signExecuteApiRequest,
      } = require('../../scripts/awsExecuteApiSigV4');
      const creds = requireCredentials(defaultCredentials(env));
      const payload = JSON.stringify(body);
      const headers = signExecuteApiRequest({
        method: 'POST',
        url,
        body: payload,
        credentials: creds,
        extraHeaders: { 'content-type': 'application/json' },
      });
      const fetchImpl =
        typeof env.fetchImpl === 'function' ? env.fetchImpl : globalThis.fetch;
      if (typeof fetchImpl !== 'function') {
        throw new Error('fetch_unavailable');
      }
      const res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: payload,
      });
      let parsed = {};
      try {
        parsed = await res.json();
      } catch (_) {
        parsed = {};
      }
      if (!res.ok) {
        const err = new Error(`search_http_${res.status}`);
        err.body = parsed;
        throw err;
      }
      return parsed;
    });

  return async (job) => {
    if (!base) throw new Error('A_SEARCH_API_URL missing');
    const searches = await loadSearchesPayload(deps.s3, bucket, job);
    if (!searches.queries.length) throw new Error('queries_empty');
    const body = {
      hostkey: job.hostkey,
      host: job.hostkey,
      guid: job.guid,
      queries: searches.queries,
      exclude: searches.exclude,
    };
    if (searches.market) body.market = searches.market;
    if (searches.currency) body.currency = searches.currency;
    if (Array.isArray(searches.brands) && searches.brands.length) {
      body.brands = searches.brands;
    }
    if (Array.isArray(searches.models) && searches.models.length) {
      body.models = searches.models;
    }
    const resp = await postJson(`${base}/search`, body);
    const queued = Array.isArray(resp.queued) ? resp.queued : [];
    return {
      searchid: resp.searchid != null ? String(resp.searchid) : '',
      providers_queued: queued.length,
      idempotent: Boolean(resp.idempotent),
    };
  };
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
  return Buffer.concat(
    chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c))),
  ).toString('utf8');
}

module.exports = {
  createPostSearchRunner,
  loadSearchesPayload,
};
