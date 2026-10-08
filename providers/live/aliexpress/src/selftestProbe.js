'use strict';

/**
 * FR-074: AliExpress selftest probe — credential check + recorded fixture path
 * (or injectable HTTP) proving affiliate product.query client wiring works.
 * Stay-dark: registry enabled stays false.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  assertAliexpressCreds,
  AliexpressCredsError,
  searchAliexpress,
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
    json.aliexpressProductAPI &&
    Array.isArray(json.aliexpressProductAPI.products)
      ? json.aliexpressProductAPI.products
      : json.result && Array.isArray(json.result.products)
        ? json.result.products
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
async function probeAliexpressSelftest(deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const t0 = now();
  const source = 'aliexpress';
  const env = deps.env || process.env;

  const elapsed = () => {
    const ms = now() - t0;
    return Number.isFinite(ms) && ms >= 0 ? ms : 0;
  };

  try {
    assertAliexpressCreds(env);
  } catch (err) {
    const code =
      err && typeof err === 'object' && err.code
        ? String(err.code)
        : 'aliexpress_missing_credentials';
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
      json = await searchAliexpress(
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
        error: 'aliexpress_fixture_invalid',
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
        : 'aliexpress_probe_failed';
    return {
      ok: false,
      source,
      latencyMs: elapsed(),
      error: msg || 'aliexpress_probe_failed',
    };
  }
}

/**
 * Orchestrator-facing probe(source) adapter (aliexpress only).
 * @param {string} source
 * @param {object} [deps]
 */
async function aliexpressSelftestProbe(source, deps) {
  if (source != null && String(source) !== 'aliexpress') {
    return {
      ok: false,
      source: String(source),
      latencyMs: 0,
      error: 'wrong_source',
    };
  }
  return probeAliexpressSelftest(deps);
}

module.exports = {
  probeAliexpressSelftest,
  aliexpressSelftestProbe,
  fixtureLooksOk,
  DEFAULT_FIXTURE,
  AliexpressCredsError,
};
