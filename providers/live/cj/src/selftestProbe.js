'use strict';

/**
 * FR-059i: CJ selftest probe — credential check + recorded fixture path
 * (or injectable HTTP) proving GraphQL client wiring works.
 * Other providers are out of scope.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  assertCjCreds,
  CjCredsError,
  readCjCreds,
  buildProductsQuery,
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
  const list =
    json &&
    json.data &&
    json.data.products &&
    Array.isArray(json.data.products.resultList)
      ? json.data.products.resultList
      : null;
  return Boolean(list && list.length > 0);
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
async function probeCjSelftest(deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const t0 = now();
  const source = 'cj';
  const env = deps.env || process.env;

  const elapsed = () => {
    const ms = now() - t0;
    return Number.isFinite(ms) && ms >= 0 ? ms : 0;
  };

  try {
    assertCjCreds(env);
  } catch (err) {
    const code =
      err && typeof err === 'object' && err.code
        ? String(err.code)
        : 'cj_missing_credentials';
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
      const creds = readCjCreds(env);
      const payload = buildProductsQuery('selftest', creds.companyId);
      json = await deps.httpRequest({
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
        return {
          ok: false,
          source,
          latencyMs: elapsed(),
          error: `CJ GraphQL errors: ${msgText}`.slice(0, 200),
        };
      }
    } else {
      const fixturePath = deps.fixturePath || DEFAULT_FIXTURE;
      json = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    }

    if (!fixtureLooksOk(json)) {
      return {
        ok: false,
        source,
        latencyMs: elapsed(),
        error: 'cj_fixture_invalid',
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
        : 'cj_probe_failed';
    return {
      ok: false,
      source,
      latencyMs: elapsed(),
      error: msg || 'cj_probe_failed',
    };
  }
}

/**
 * Orchestrator-facing probe(source) adapter (cj only).
 * @param {string} source
 * @param {object} [deps]
 */
async function cjSelftestProbe(source, deps) {
  if (source != null && String(source) !== 'cj') {
    return {
      ok: false,
      source: String(source),
      latencyMs: 0,
      error: 'wrong_source',
    };
  }
  return probeCjSelftest(deps);
}

module.exports = {
  probeCjSelftest,
  cjSelftestProbe,
  fixtureLooksOk,
  DEFAULT_FIXTURE,
  CjCredsError,
};
