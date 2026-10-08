'use strict';

/**
 * FR-059f: Amazon selftest probe — credential check + recorded fixture path
 * (or injectable HTTP) proving the PA-API client wiring works.
 * Other providers are out of scope.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  assertAmazonCreds,
  AmazonCredsError,
  buildSearchItemsBody,
  signPaapiRequest,
  readAmazonCreds,
} = require('./search');

const DEFAULT_FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'search-items-ok.json',
);

/**
 * @param {unknown} json
 * @returns {boolean}
 */
function fixtureLooksOk(json) {
  return Boolean(
    json &&
      typeof json === 'object' &&
      json.SearchResult &&
      Array.isArray(json.SearchResult.Items) &&
      json.SearchResult.Items.length > 0,
  );
}

/**
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   now?: () => number,
 *   fixturePath?: string,
 *   httpRequest?: (signed: object) => Promise<object>,
 *   useFixture?: boolean,
 * }} [deps]
 * @returns {Promise<{ ok: boolean, source: string, latencyMs: number, error?: string }>}
 */
async function probeAmazonSelftest(deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const t0 = now();
  const source = 'amazon';
  const env = deps.env || process.env;

  const elapsed = () => {
    const ms = now() - t0;
    return Number.isFinite(ms) && ms >= 0 ? ms : 0;
  };

  try {
    assertAmazonCreds(env);
  } catch (err) {
    const code =
      err && typeof err === 'object' && err.code
        ? String(err.code)
        : 'amazon_missing_credentials';
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
      const creds = readAmazonCreds(env);
      const payload = buildSearchItemsBody({ q: 'selftest' }, creds);
      const body = JSON.stringify(payload);
      const signed = signPaapiRequest({
        host: creds.host,
        region: creds.region,
        accessKey: creds.accessKey,
        secretKey: creds.secretKey,
        body,
      });
      json = await deps.httpRequest(signed);
    } else {
      // Recorded fixture path (default) — no live PA-API call.
      const fixturePath = deps.fixturePath || DEFAULT_FIXTURE;
      json = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    }

    if (!fixtureLooksOk(json)) {
      return {
        ok: false,
        source,
        latencyMs: elapsed(),
        error: 'amazon_fixture_invalid',
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
        : 'amazon_probe_failed';
    return {
      ok: false,
      source,
      latencyMs: elapsed(),
      error: msg || 'amazon_probe_failed',
    };
  }
}

/**
 * Orchestrator-facing probe(source) adapter (amazon only).
 * @param {string} source
 * @param {object} [deps]
 */
async function amazonSelftestProbe(source, deps) {
  if (source != null && String(source) !== 'amazon') {
    return {
      ok: false,
      source: String(source),
      latencyMs: 0,
      error: 'wrong_source',
    };
  }
  return probeAmazonSelftest(deps);
}

module.exports = {
  probeAmazonSelftest,
  amazonSelftestProbe,
  fixtureLooksOk,
  DEFAULT_FIXTURE,
  AmazonCredsError,
};
