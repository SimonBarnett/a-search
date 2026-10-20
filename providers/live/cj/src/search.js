'use strict';

/**
 * CJ GraphQL Product Search client (FR-041) against ads.api.cj.com.
 * HTTP injectable for fixtures.
 */

const { normalizeSearchResponse } = require('./normalize');

class CjCredsError extends Error {
  constructor(message) {
    super(message || 'cj_missing_credentials');
    this.name = 'CjCredsError';
    this.code = 'cj_missing_credentials';
  }
}

const DEFAULT_GRAPHQL_URL = 'https://ads.api.cj.com/query';

/**
 * @param {Record<string, string|undefined>} [env]
 */
function readCjCreds(env) {
  const e = env || process.env;
  const token = e.CJ_API_TOKEN != null ? String(e.CJ_API_TOKEN).trim() : '';
  const graphqlUrl =
    e.CJ_GRAPHQL_URL != null && String(e.CJ_GRAPHQL_URL).trim()
      ? String(e.CJ_GRAPHQL_URL).trim()
      : DEFAULT_GRAPHQL_URL;
  const companyId =
    e.CJ_COMPANY_ID != null ? String(e.CJ_COMPANY_ID).trim() : '';
  // FR #4713: GraphQL linkCode(pid: ID!) is the publisher website / property id.
  const websiteId =
    e.CJ_WEBSITE_ID != null ? String(e.CJ_WEBSITE_ID).trim() : '';
  return { token, graphqlUrl, companyId, websiteId };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertCjCreds(env) {
  const c = readCjCreds(env);
  const missing = [];
  if (!c.token) missing.push('CJ_API_TOKEN');
  // FR #4713: ads.api.cj.com requires linkCode(pid:) --- same id as tracked CJ_WEBSITE_ID.
  if (!c.websiteId) missing.push('CJ_WEBSITE_ID');
  if (missing.length) {
    throw new CjCredsError(
      `CJ GraphQL credentials missing: ${missing.join(', ')}. Set them in providers/live/cj/.env (never commit).`,
    );
  }
  return c;
}

const {
  keywordsFromAgentMsg,
} = require('../../../../shared/search/keywordsFromAgentMsg');

function keywordsFromMsg(msg) {
  // FR #4450 / #4446: agent fan-out uses queries/exclude (legacy q/searchterms kept).
  return keywordsFromAgentMsg(msg);
}


/** CJ Product Search: "Too many keywords. Please limit keywords to 10 or fewer". */
const MAX_CJ_KEYWORDS = 10;

/**
 * FR #4748 / #4752: normalize to [String!] with at most MAX_CJ_KEYWORDS tokens.
 * CJ counts on non-alphanumeric splits (hyphen in `761-14` is two keywords), not
 * whitespace alone — whitespace-only caps still 400 "Too many keywords".
 * @param {string|string[]} keywords
 * @returns {string[]}
 */
function splitCjKeywordTokens(text) {
  return String(text || '')
    .split(/[^A-Za-z0-9]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalizeCjKeywordList(keywords) {
  let keywordList;
  if (Array.isArray(keywords)) {
    keywordList = keywords.map((k) => String(k || '').trim()).filter(Boolean);
  } else {
    const one = String(keywords || '').trim();
    keywordList = one ? [one] : [];
  }
  if (!keywordList.length) {
    throw new Error('CJ GraphQL keywords must be a non-empty [String!]');
  }
  const tokens = [];
  for (const item of keywordList) {
    for (const t of splitCjKeywordTokens(item)) {
      if (tokens.length >= MAX_CJ_KEYWORDS) break;
      tokens.push(t);
    }
    if (tokens.length >= MAX_CJ_KEYWORDS) break;
  }
  if (!tokens.length) {
    throw new Error('CJ GraphQL keywords must be a non-empty [String!]');
  }
  // Keep a single joined element when the caller passed one string (FR #4740
  // shape); otherwise return the expanded token list from an explicit array.
  if (!Array.isArray(keywords)) {
    return [tokens.join(' ')];
  }
  return tokens;
}

/**
 * Minimal products search query (fields may vary by CJ schema version).
 * FR #4713: linkCode requires pid (publisher website / property ID).
 * FR #4740: products.keywords is [String!] (not String!); send a non-empty array.
 * FR #4748 / #4752: at most 10 CJ-counted tokens (split on non-alnum; HTTP 400 otherwise).
 * @param {string|string[]} keywords
 * @param {string} [companyId]
 * @param {string} websiteId CJ_WEBSITE_ID / GraphQL linkCode pid
 */
function buildProductsQuery(keywords, companyId, websiteId) {
  const companyArg = companyId
    ? `companyId: "${String(companyId).replace(/"/g, '')}", `
    : '';
  const pid = String(websiteId || '').replace(/"/g, '');
  if (!pid) {
    throw new CjCredsError(
      'CJ GraphQL credentials missing: CJ_WEBSITE_ID. Set them in providers/live/cj/.env (never commit).',
    );
  }
  const keywordList = normalizeCjKeywordList(keywords);
  return {
    query: `query ProductSearch($keywords: [String!]!) {
  products(${companyArg}keywords: $keywords, limit: 10) {
    resultList {
      id
      title
      imageLink
      price { amount currency }
      linkCode(pid: "${pid}") { clickUrl }
    }
  }
}`,
    variables: { keywords: keywordList },
  };
}

/**
 * FR #4762: permanent CJ auth faults (do not DLQ / intake-fatal).
 * @param {number} status
 * @param {object|null|undefined} json
 * @param {string} [text]
 * @returns {string|null}
 */
function classifyCjHttpFault(status, json, text) {
  const body = json && typeof json === 'object' ? json : {};
  const msg = String(body.message || text || '');
  const statusN = Number(status);
  if (
    statusN === 401 ||
    /not Authori[sz]ed/i.test(msg) ||
    /unauthorized/i.test(msg)
  ) {
    return 'cj_not_authorised';
  }
  return null;
}

/**
 * @param {Error} err
 * @param {number} status
 * @param {object|null|undefined} json
 * @param {string} text
 */
function attachCjHttpFault(err, status, json, text) {
  err.statusCode = status;
  err.status = status;
  const fault = classifyCjHttpFault(status, json, text);
  if (fault) {
    err.code = fault;
    err.nonRetryable = true;
  }
  return err;
}

/**
 * @param {{ method: string, url: string, headers?: object, body?: string }} req
 */
async function defaultHttpRequest(req) {
  const https = require('node:https');
  const { URL } = require('node:url');
  const u = new URL(req.url);
  const payload = req.body != null ? String(req.body) : null;
  const headers = Object.assign({}, req.headers || {});
  if (payload != null && headers['Content-Length'] == null) {
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: req.method || 'POST',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json;
          try {
            json = text ? JSON.parse(text) : {};
          } catch {
            // FR #4762: non-JSON 403 Authorised body is permanent (status IN).
            const err = new Error(
              `CJ HTTP non-JSON ${res.statusCode}: ${text.slice(0, 200)}`,
            );
            err.bodyText = String(text || '').slice(0, 200);
            reject(attachCjHttpFault(err, res.statusCode, null, text));
            return;
          }
          if (res.statusCode >= 400) {
            const err = new Error(
              `CJ HTTP ${res.statusCode}: ${text.slice(0, 300)}`,
            );
            err.body = json;
            reject(attachCjHttpFault(err, res.statusCode, json, text));
            return;
          }
          resolve(json);
        });
      },
    );
    r.on('error', reject);
    if (payload != null) r.write(payload);
    r.end();
  });
}

/**
 * @param {object} msg
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 * }} [deps]
 * @returns {Promise<object[]>}
 */
async function searchCj(msg, deps) {
  if (!keywordsFromMsg(msg)) return [];
  const envVars = (deps && deps.env) || process.env;
  const creds = assertCjCreds(envVars);
  const httpRequest =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultHttpRequest;

  const keywords = keywordsFromMsg(msg);
  const payload = buildProductsQuery(
    keywords,
    creds.companyId,
    creds.websiteId,
  );
  const json = await httpRequest({
    method: 'POST',
    url: creds.graphqlUrl,
    headers: {
      Authorization: `Bearer ${creds.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (json && Array.isArray(json.errors) && json.errors.length) {
    const msgText = json.errors
      .map((e) => (e && e.message ? e.message : String(e)))
      .join('; ');
    throw new Error(`CJ GraphQL errors: ${msgText}`);
  }

  return normalizeSearchResponse(json, {
    userId: msg && msg.userId,
    env: msg && msg.env,
    envVars,
  });
}

module.exports = {
  searchCj,
  assertCjCreds,
  readCjCreds,
  CjCredsError,
  buildProductsQuery,
  normalizeCjKeywordList,
  MAX_CJ_KEYWORDS,
  keywordsFromMsg,
  classifyCjHttpFault,
  DEFAULT_GRAPHQL_URL,
};
