'use strict';

/**
 * FR-066: Kelkoo selftest probe — credential check + recorded fixture path
 * (or injectable HTTP) proving Shopping API client wiring works.
 * Enabled via FR-167; fixture selftest remains the offline pin.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  assertKelkooCreds,
  KelkooCredsError,
  searchKelkoo,
} = require('./search');

const DEFAULT_FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'offers-ok.json',
);

/**
 * @param {unknown} json
 * @returns {boolean}
 */
function fixtureLooksOk(json) {
  return Boolean(
    json &&
      typeof json === 'object' &&
      Array.isArray(json.offers) &&
      json.offers.length > 0,
  );
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
async function probeKelkooSelftest(deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const t0 = now();
  const source = 'kelkoo';
  const env = deps.env || process.env;

  const elapsed = () => {
    const ms = now() - t0;
    return Number.isFinite(ms) && ms >= 0 ? ms : 0;
  };

  try {
    assertKelkooCreds(env);
  } catch (err) {
    const code =
      err && typeof err === 'object' && err.code
        ? String(err.code)
        : 'kelkoo_missing_credentials';
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
      json = await searchKelkoo(
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
        error: 'kelkoo_fixture_invalid',
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
        : 'kelkoo_probe_failed';
    return {
      ok: false,
      source,
      latencyMs: elapsed(),
      error: msg || 'kelkoo_probe_failed',
    };
  }
}

/**
 * Orchestrator-facing probe(source) adapter (kelkoo only).
 * @param {string} source
 * @param {object} [deps]
 */
async function kelkooSelftestProbe(source, deps) {
  if (source != null && String(source) !== 'kelkoo') {
    return {
      ok: false,
      source: String(source),
      latencyMs: 0,
      error: 'wrong_source',
    };
  }
  return probeKelkooSelftest(deps);
}

module.exports = {
  probeKelkooSelftest,
  kelkooSelftestProbe,
  fixtureLooksOk,
  DEFAULT_FIXTURE,
  KelkooCredsError,
};
