'use strict';

/**
 * FR-082: Bol selftest probe — credential check + recorded fixture path
 * (or injectable HTTP) proving catalog search client wiring works.
 * Stay-dark: registry enabled stays false.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  assertBolCreds,
  BolCredsError,
  searchBol,
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
    json.bolProductAPI && Array.isArray(json.bolProductAPI.products)
      ? json.bolProductAPI.products
      : Array.isArray(json.products)
        ? json.products
        : Array.isArray(json.offers)
          ? json.offers
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
async function probeBolSelftest(deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const t0 = now();
  const source = 'bol';
  const env = deps.env || process.env;

  const elapsed = () => {
    const ms = now() - t0;
    return Number.isFinite(ms) && ms >= 0 ? ms : 0;
  };

  try {
    assertBolCreds(env);
  } catch (err) {
    const code =
      err && typeof err === 'object' && err.code
        ? String(err.code)
        : 'bol_missing_credentials';
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
      json = await searchBol(
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
        error: 'bol_fixture_invalid',
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
        : 'bol_probe_failed';
    return {
      ok: false,
      source,
      latencyMs: elapsed(),
      error: msg || 'bol_probe_failed',
    };
  }
}

/**
 * Orchestrator-facing probe(source) adapter (bol only).
 * @param {string} source
 * @param {object} [deps]
 */
async function bolSelftestProbe(source, deps) {
  if (source != null && String(source) !== 'bol') {
    return {
      ok: false,
      source: String(source),
      latencyMs: 0,
      error: 'wrong_source',
    };
  }
  return probeBolSelftest(deps);
}

module.exports = {
  probeBolSelftest,
  bolSelftestProbe,
  fixtureLooksOk,
  DEFAULT_FIXTURE,
  BolCredsError,
};
