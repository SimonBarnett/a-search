'use strict';

/**
 * FR-059f / FR-184: Amazon selftest probe.
 * Default: PA-API credential check + recorded fixture (or injectable HTTP).
 * When Creators flag is on (FR-181/182/183): Creators creds + creators fixture /
 * injectable HTTP. Fail-closed codes stay redacted (no secret values).
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
const {
  isCreatorsSearchEnabled,
  assertCreatorsCreds,
  AmazonCreatorsCredsError,
  buildCreatorsSearchRequest,
  readCreatorsCreds,
} = require('./creatorsSearch');

const DEFAULT_FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'search-items-ok.json',
);

const DEFAULT_CREATORS_FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'creators-search-ok.json',
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
 * @param {unknown} json
 * @returns {boolean}
 */
function creatorsFixtureLooksOk(json) {
  const list =
    json && typeof json === 'object' && Array.isArray(json.items)
      ? json.items
      : json && typeof json === 'object' && Array.isArray(json.results)
        ? json.results
        : null;
  return Boolean(list && list.length > 0);
}

/**
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   now?: () => number,
 *   fixturePath?: string,
 *   httpRequest?: (req: object) => Promise<object>,
 *   useFixture?: boolean,
 * }} [deps]
 * @returns {Promise<{ ok: boolean, source: string, latencyMs: number, error?: string, searchApi?: string }>}
 */
async function probeAmazonSelftest(deps = {}) {
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const t0 = now();
  const source = 'amazon';
  const env = deps.env || process.env;
  const useCreators = isCreatorsSearchEnabled(env);

  const elapsed = () => {
    const ms = now() - t0;
    return Number.isFinite(ms) && ms >= 0 ? ms : 0;
  };

  if (useCreators) {
    try {
      assertCreatorsCreds(env);
    } catch (err) {
      const code =
        err && typeof err === 'object' && err.code
          ? String(err.code)
          : 'amazon_creators_missing_credentials';
      return {
        ok: false,
        source,
        latencyMs: elapsed(),
        error: code,
        searchApi: 'creators',
      };
    }

    try {
      let json;
      if (typeof deps.httpRequest === 'function') {
        const creds = readCreatorsCreds(env);
        const req = buildCreatorsSearchRequest({ q: 'selftest' }, creds);
        json = await deps.httpRequest(req);
      } else {
        const fixturePath = deps.fixturePath || DEFAULT_CREATORS_FIXTURE;
        json = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      }

      if (!creatorsFixtureLooksOk(json)) {
        return {
          ok: false,
          source,
          latencyMs: elapsed(),
          error: 'amazon_creators_fixture_invalid',
          searchApi: 'creators',
        };
      }

      return {
        ok: true,
        source,
        latencyMs: elapsed(),
        searchApi: 'creators',
      };
    } catch (err) {
      const msg =
        err && typeof err === 'object' && err.message
          ? String(err.message).slice(0, 200)
          : 'amazon_creators_probe_failed';
      return {
        ok: false,
        source,
        latencyMs: elapsed(),
        error: msg || 'amazon_creators_probe_failed',
        searchApi: 'creators',
      };
    }
  }

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
      searchApi: 'paapi',
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
      // Recorded fixture path (default) - no live PA-API call.
      const fixturePath = deps.fixturePath || DEFAULT_FIXTURE;
      json = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    }

    if (!fixtureLooksOk(json)) {
      return {
        ok: false,
        source,
        latencyMs: elapsed(),
        error: 'amazon_fixture_invalid',
        searchApi: 'paapi',
      };
    }

    return {
      ok: true,
      source,
      latencyMs: elapsed(),
      searchApi: 'paapi',
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
      searchApi: 'paapi',
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
  creatorsFixtureLooksOk,
  DEFAULT_FIXTURE,
  DEFAULT_CREATORS_FIXTURE,
  AmazonCredsError,
  AmazonCreatorsCredsError,
};
