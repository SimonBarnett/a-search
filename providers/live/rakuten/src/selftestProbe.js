'use strict';

/**
 * FR-059h: Rakuten selftest probe — credential check + recorded fixture path
 * (or injectable HTTP) proving Product Search client wiring works.
 * Other providers are out of scope.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  assertRakutenCreds,
  RakutenCredsError,
  readRakutenCreds,
  parseProductSearchXml,
} = require('./search');

const DEFAULT_FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'product-search-ok.xml',
);

/**
 * @param {string} xml
 * @returns {boolean}
 */
function fixtureLooksOk(xml) {
  const items = parseProductSearchXml(typeof xml === 'string' ? xml : '');
  return Array.isArray(items) && items.length > 0;
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
async function probeRakutenSelftest(deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const t0 = now();
  const source = 'rakuten';
  const env = deps.env || process.env;

  const elapsed = () => {
    const ms = now() - t0;
    return Number.isFinite(ms) && ms >= 0 ? ms : 0;
  };

  try {
    assertRakutenCreds(env);
  } catch (err) {
    const code =
      err && typeof err === 'object' && err.code
        ? String(err.code)
        : 'rakuten_missing_credentials';
    return {
      ok: false,
      source,
      latencyMs: elapsed(),
      error: code,
    };
  }

  try {
    let xml;
    if (typeof deps.httpRequest === 'function') {
      const creds = readRakutenCreds(env);
      const params = new URLSearchParams({
        applicationkey: creds.applicationKey,
        keyword: 'selftest',
        max: '10',
      });
      if (creds.affiliateId) params.set('affiliateid_1', creds.affiliateId);
      const url = `${creds.endpoint}productsearch/1.0?${params.toString()}`;
      const res = await deps.httpRequest({
        method: 'GET',
        url,
        headers: { Accept: 'application/xml, text/xml, */*' },
      });
      xml =
        typeof res === 'string'
          ? res
          : res && typeof res.body === 'string'
            ? res.body
            : '';
    } else {
      // Recorded fixture path (default) — no live Product Search call.
      const fixturePath = deps.fixturePath || DEFAULT_FIXTURE;
      xml = fs.readFileSync(fixturePath, 'utf8');
    }

    if (!fixtureLooksOk(xml)) {
      return {
        ok: false,
        source,
        latencyMs: elapsed(),
        error: 'rakuten_fixture_invalid',
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
        : 'rakuten_probe_failed';
    return {
      ok: false,
      source,
      latencyMs: elapsed(),
      error: msg || 'rakuten_probe_failed',
    };
  }
}

/**
 * Orchestrator-facing probe(source) adapter (rakuten only).
 * @param {string} source
 * @param {object} [deps]
 */
async function rakutenSelftestProbe(source, deps) {
  if (source != null && String(source) !== 'rakuten') {
    return {
      ok: false,
      source: String(source),
      latencyMs: 0,
      error: 'wrong_source',
    };
  }
  return probeRakutenSelftest(deps);
}

module.exports = {
  probeRakutenSelftest,
  rakutenSelftestProbe,
  fixtureLooksOk,
  DEFAULT_FIXTURE,
  RakutenCredsError,
};
