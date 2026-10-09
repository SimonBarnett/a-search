#!/usr/bin/env node
'use strict';

/**
 * FR-144: post-deploy smoke - fixture JWT -> POST /search (200 accept) +
 * GET /selftest (JSON shape). No live provider credentials required for the
 * accept / shape checks (provider probe failures are reported, not fatal).
 *
 * Usage:
 *   node scripts/smoke-deploy.js --url https://xxxx.execute-api... --jwt "$TOKEN"
 *   A_SEARCH_API_URL=... A_SEARCH_SMOKE_JWT=... node scripts/smoke-deploy.js
 *
 * Never prints the JWT. Out of scope: CI hitting production without approval.
 */

const DEFAULT_SEARCH_BODY = {
  q: 'a-search smoke fixture',
  catalogId: 1,
  category: 'Smoke',
  subcategory: 'Fixture',
  sandbox: true,
};

/**
 * @param {string} baseUrl
 * @returns {string}
 */
function normalizeBaseUrl(baseUrl) {
  const s = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!s) {
    throw new Error(
      'FR-144: missing API base URL (pass --url or set A_SEARCH_API_URL)',
    );
  }
  if (!/^https?:\/\//i.test(s)) {
    throw new Error(`FR-144: API base URL must be http(s): ${s}`);
  }
  return s;
}

/**
 * @param {string} jwt
 * @returns {string}
 */
function requireJwt(jwt) {
  const t = String(jwt || '').trim();
  if (!t) {
    throw new Error(
      'FR-144: missing fixture JWT (pass --jwt or set A_SEARCH_SMOKE_JWT)',
    );
  }
  return t;
}

/**
 * @param {unknown} body
 */
function assertSearchAccept(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('FR-144: /search body must be a JSON object');
  }
  const o = /** @type {Record<string, unknown>} */ (body);
  if (o.accepted !== true) {
    throw new Error(
      `FR-144: /search expected accepted:true, got ${JSON.stringify(o.accepted)}`,
    );
  }
  if (typeof o.searchId !== 'string' || !o.searchId) {
    throw new Error('FR-144: /search missing searchId string');
  }
}

/**
 * Selftest shape per docs/endpoint-selftest.md - runner may list failed
 * providers; we only require the table shape (no live creds).
 * @param {unknown} body
 */
function assertSelftestShape(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('FR-144: /selftest body must be a JSON object');
  }
  const o = /** @type {Record<string, unknown>} */ (body);
  if (typeof o.ok !== 'boolean') {
    throw new Error('FR-144: /selftest missing boolean ok');
  }
  if (!Array.isArray(o.providers)) {
    throw new Error('FR-144: /selftest missing providers array');
  }
  for (const row of o.providers) {
    if (!row || typeof row !== 'object') {
      throw new Error('FR-144: /selftest providers row must be an object');
    }
    const r = /** @type {Record<string, unknown>} */ (row);
    if (typeof r.id !== 'string' || !r.id) {
      throw new Error('FR-144: /selftest providers[].id must be a string');
    }
    if (typeof r.ok !== 'boolean') {
      throw new Error(`FR-144: /selftest providers[${r.id}].ok must be boolean`);
    }
  }
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   baseUrl: string,
 *   jwt: string,
 *   searchBody?: Record<string, unknown>,
 * }} opts
 */
async function runSmoke(opts) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('FR-144: fetch is not available');
  }
  const base = normalizeBaseUrl(opts.baseUrl);
  const jwt = requireJwt(opts.jwt);
  const searchBody = opts.searchBody || DEFAULT_SEARCH_BODY;
  const auth = { Authorization: `Bearer ${jwt}` };

  const searchRes = await fetchImpl(`${base}/search`, {
    method: 'POST',
    headers: {
      ...auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(searchBody),
  });
  const searchText = await searchRes.text();
  let searchJson;
  try {
    searchJson = searchText ? JSON.parse(searchText) : null;
  } catch {
    throw new Error(
      `FR-144: /search HTTP ${searchRes.status} non-JSON body (${searchText.slice(0, 120)})`,
    );
  }
  if (searchRes.status !== 200) {
    throw new Error(
      `FR-144: /search expected HTTP 200, got ${searchRes.status} ${JSON.stringify(searchJson)}`,
    );
  }
  assertSearchAccept(searchJson);

  const selfRes = await fetchImpl(`${base}/selftest?sandbox=true`, {
    method: 'GET',
    headers: {
      ...auth,
      Accept: 'application/json',
    },
  });
  const selfText = await selfRes.text();
  let selfJson;
  try {
    selfJson = selfText ? JSON.parse(selfText) : null;
  } catch {
    throw new Error(
      `FR-144: /selftest HTTP ${selfRes.status} non-JSON body (${selfText.slice(0, 120)})`,
    );
  }
  if (selfRes.status !== 200) {
    throw new Error(
      `FR-144: /selftest expected HTTP 200, got ${selfRes.status} ${JSON.stringify(selfJson)}`,
    );
  }
  assertSelftestShape(selfJson);

  return {
    ok: true,
    searchId: searchJson.searchId,
    selftestOk: selfJson.ok,
    providers: selfJson.providers.length,
  };
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

async function main() {
  const baseUrl = argValue('--url') || process.env.A_SEARCH_API_URL;
  const jwt = argValue('--jwt') || process.env.A_SEARCH_SMOKE_JWT;
  const result = await runSmoke({ baseUrl, jwt });
  process.stdout.write(JSON.stringify(result) + '\n');
}

module.exports = {
  runSmoke,
  normalizeBaseUrl,
  requireJwt,
  assertSearchAccept,
  assertSelftestShape,
  DEFAULT_SEARCH_BODY,
};

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(
      (err && err.message ? err.message : String(err)) + '\n',
    );
    process.exit(1);
  });
}
