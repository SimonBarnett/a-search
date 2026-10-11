'use strict';

/**
 * FR-078: Etsy selftest probe - credential check + recorded fixture path
 * (or injectable HTTP) proving Open API listings client wiring works.
 * Registry enabled true (FR-170).
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  assertEtsyCreds,
  EtsyCredsError,
  searchEtsy,
} = require('./search');

const DEFAULT_FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'listings-ok.json',
);

/**
 * @param {unknown} json
 * @returns {boolean}
 */
function fixtureLooksOk(json) {
  if (!json || typeof json !== 'object') return false;
  const results =
    json.etsyProductAPI && Array.isArray(json.etsyProductAPI.results)
      ? json.etsyProductAPI.results
      : Array.isArray(json.results)
        ? json.results
        : Array.isArray(json.listings)
          ? json.listings
          : null;
  return Boolean(results && results.length > 0);
}

/**
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   now?: () => number,
 *   fixturePath?: string,
 *   httpRequest?: Function,
 * }} [deps]
 * @returns {Promise<{ ok: boolean, source: string, latencyMs: number, error?: string }>}
 */
async function probeEtsySelftest(deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const t0 = now();
  const source = 'etsy';
  const env = deps.env || process.env;

  const elapsed = () => {
    const ms = now() - t0;
    return Number.isFinite(ms) && ms >= 0 ? ms : 0;
  };

  try {
    assertEtsyCreds(env);
  } catch (err) {
    const code =
      err && typeof err === 'object' && err.code
        ? String(err.code)
        : 'etsy_missing_credentials';
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
      json = await searchEtsy(
        { q: 'selftest', env: 'sandbox' },
        { env, httpRequest: deps.httpRequest },
      );
    } else {
      const fixturePath = deps.fixturePath || DEFAULT_FIXTURE;
      json = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    }

    if (!fixtureLooksOk(json)) {
      return {
        ok: false,
        source,
        latencyMs: elapsed(),
        error: 'etsy_fixture_invalid',
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
        : 'etsy_probe_failed';
    return {
      ok: false,
      source,
      latencyMs: elapsed(),
      error: msg || 'etsy_probe_failed',
    };
  }
}

/**
 * Orchestrator-facing probe(source) adapter (etsy only).
 * @param {string} source
 * @param {object} [deps]
 */
async function etsySelftestProbe(source, deps) {
  if (source != null && String(source) !== 'etsy') {
    return {
      ok: false,
      source: String(source),
      latencyMs: 0,
      error: 'wrong_source',
    };
  }
  return probeEtsySelftest(deps);
}

module.exports = {
  probeEtsySelftest,
  etsySelftestProbe,
  fixtureLooksOk,
  DEFAULT_FIXTURE,
  EtsyCredsError,
};
