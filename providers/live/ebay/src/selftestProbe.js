'use strict';

/**
 * FR-059g: eBay selftest probe — credential check + recorded fixture path
 * (or injectable HTTP) proving Browse API client wiring works.
 * Other providers are out of scope.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  assertEbayCreds,
  EbayCredsError,
  readEbayCreds,
  apiHost,
  fetchAccessToken,
} = require('./search');

const DEFAULT_FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'item-summary-ok.json',
);

/**
 * @param {unknown} json
 * @returns {boolean}
 */
function fixtureLooksOk(json) {
  return Boolean(
    json &&
      typeof json === 'object' &&
      Array.isArray(json.itemSummaries) &&
      json.itemSummaries.length > 0,
  );
}

/**
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   now?: () => number,
 *   fixturePath?: string,
 *   httpRequest?: Function,
 *   accessToken?: string,
 * }} [deps]
 * @returns {Promise<{ ok: boolean, source: string, latencyMs: number, error?: string }>}
 */
async function probeEbaySelftest(deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const t0 = now();
  const source = 'ebay';
  const env = deps.env || process.env;

  const elapsed = () => {
    const ms = now() - t0;
    return Number.isFinite(ms) && ms >= 0 ? ms : 0;
  };

  try {
    assertEbayCreds(env);
  } catch (err) {
    const code =
      err && typeof err === 'object' && err.code
        ? String(err.code)
        : 'ebay_missing_credentials';
    return {
      ok: false,
      source,
      latencyMs: elapsed(),
      error: code,
    };
  }

  try {
    let json;
    if (typeof deps.httpRequest === 'function') {
      const creds = readEbayCreds(env);
      const httpRequest = deps.httpRequest;
      const token =
        typeof deps.accessToken === 'string' && deps.accessToken
          ? deps.accessToken
          : await fetchAccessToken(creds, httpRequest);
      const host = apiHost(creds.ebayEnv);
      const url = `https://${host}/buy/browse/v1/item_summary/search?q=${encodeURIComponent('selftest')}&limit=10`;
      json = await httpRequest({
        method: 'GET',
        url,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': creds.marketplaceId,
          Accept: 'application/json',
        },
      });
    } else {
      // Recorded fixture path (default) — no live Browse API call.
      const fixturePath = deps.fixturePath || DEFAULT_FIXTURE;
      json = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    }

    if (!fixtureLooksOk(json)) {
      return {
        ok: false,
        source,
        latencyMs: elapsed(),
        error: 'ebay_fixture_invalid',
      };
    }

    return {
      ok: true,
      source,
      latencyMs: elapsed(),
    };
  } catch (err) {
    const msg =
      err && typeof err === 'object' && err.message
        ? String(err.message).slice(0, 200)
        : 'ebay_probe_failed';
    return {
      ok: false,
      source,
      latencyMs: elapsed(),
      error: msg || 'ebay_probe_failed',
    };
  }
}

/**
 * Orchestrator-facing probe(source) adapter (ebay only).
 * @param {string} source
 * @param {object} [deps]
 */
async function ebaySelftestProbe(source, deps) {
  if (source != null && String(source) !== 'ebay') {
    return {
      ok: false,
      source: String(source),
      latencyMs: 0,
      error: 'wrong_source',
    };
  }
  return probeEbaySelftest(deps);
}

module.exports = {
  probeEbaySelftest,
  ebaySelftestProbe,
  fixtureLooksOk,
  DEFAULT_FIXTURE,
  EbayCredsError,
};
