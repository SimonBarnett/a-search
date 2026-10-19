'use strict';

/**
 * FR-070 / FR-168: Skimlinks selftest probe - credential check + recorded fixture path
 * (or injectable HTTP) proving Product API client wiring works.
 * Registry enabled true (FR-168); fixture path remains the offline green pin.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  assertSkimlinksCreds,
  SkimlinksCredsError,
  searchSkimlinks,
} = require('./search');

const DEFAULT_FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'products-ok.json',
);

/**
 * @param {unknown} json
 * @returns {boolean}
 */
function fixtureLooksOk(json) {
  if (!json || typeof json !== 'object') return false;
  const products =
    json.skimlinksProductAPI && Array.isArray(json.skimlinksProductAPI.products)
      ? json.skimlinksProductAPI.products
      : Array.isArray(json.products)
        ? json.products
        : null;
  return Boolean(products && products.length > 0);
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
async function probeSkimlinksSelftest(deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const t0 = now();
  const source = 'skimlinks';
  const env = deps.env || process.env;

  const elapsed = () => {
    const ms = now() - t0;
    return Number.isFinite(ms) && ms >= 0 ? ms : 0;
  };

  try {
    assertSkimlinksCreds(env);
  } catch (err) {
    const code =
      err && typeof err === 'object' && err.code
        ? String(err.code)
        : 'skimlinks_missing_credentials';
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
      json = await searchSkimlinks(
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
        error: 'skimlinks_fixture_invalid',
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
        : 'skimlinks_probe_failed';
    return {
      ok: false,
      source,
      latencyMs: elapsed(),
      error: msg || 'skimlinks_probe_failed',
    };
  }
}

/**
 * Orchestrator-facing probe(source) adapter (skimlinks only).
 * @param {string} source
 * @param {object} [deps]
 */
async function skimlinksSelftestProbe(source, deps) {
  if (source != null && String(source) !== 'skimlinks') {
    return {
      ok: false,
      source: String(source),
      latencyMs: 0,
      error: 'wrong_source',
    };
  }
  return probeSkimlinksSelftest(deps);
}

module.exports = {
  probeSkimlinksSelftest,
  skimlinksSelftestProbe,
  fixtureLooksOk,
  DEFAULT_FIXTURE,
  SkimlinksCredsError,
};
