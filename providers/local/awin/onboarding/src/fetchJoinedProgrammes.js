'use strict';

/**
 * Fetch Awin programmes the publisher has joined (FR-050a).
 * Injectable HTTP — no live network in unit tests.
 *
 * API (clubscan / Awin publisher API intent):
 *   GET {base}/publishers/{publisherId}/programmes?relationship=joined
 *   Authorization: Bearer {AWIN_API_TOKEN}
 */

const DEFAULT_BASE = 'https://api.awin.com';

class AwinOnboardingError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'AwinOnboardingError';
    this.code = code;
  }
}

/**
 * @param {Record<string, string|undefined>} [env]
 * @returns {{ token: string, publisherId: string, baseUrl: string }}
 */
function readAwinCreds(env = process.env) {
  const token = (env.AWIN_API_TOKEN || '').trim();
  const publisherId = String(
    env.AWIN_PUBLISHER_ID || env.AWIN_PUBLISHERID || '',
  ).trim();
  const baseUrl = (env.AWIN_API_BASE || DEFAULT_BASE).replace(/\/$/, '');
  if (!token) {
    throw new AwinOnboardingError(
      'missing_awin_token',
      'AWIN_API_TOKEN is required to fetch joined programmes',
    );
  }
  if (!publisherId) {
    throw new AwinOnboardingError(
      'missing_awin_publisher',
      'AWIN_PUBLISHER_ID is required to fetch joined programmes',
    );
  }
  return { token, publisherId, baseUrl };
}

/**
 * Normalize API JSON into a stable programme list.
 * @param {unknown} body
 * @returns {object[]}
 */
function normalizeProgrammes(body) {
  let list = body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    if (Array.isArray(body.programmes)) list = body.programmes;
    else if (Array.isArray(body.data)) list = body.data;
    else if (Array.isArray(body.results)) list = body.results;
  }
  if (!Array.isArray(list)) {
    throw new AwinOnboardingError(
      'invalid_programmes_payload',
      'Awin programmes response must be an array or { programmes: [] }',
    );
  }
  return list.map((row) => {
    const r = row && typeof row === 'object' ? row : {};
    return {
      id: r.id != null ? String(r.id) : r.programmeId != null ? String(r.programmeId) : '',
      name: r.name != null ? String(r.name) : r.programmeName != null ? String(r.programmeName) : '',
      displayUrl:
        r.displayUrl != null
          ? String(r.displayUrl)
          : r.website != null
            ? String(r.website)
            : undefined,
      logoUrl: r.logoUrl != null ? String(r.logoUrl) : undefined,
      primarySector:
        r.primarySector != null
          ? String(r.primarySector)
          : r.sector != null
            ? String(r.sector)
            : undefined,
      description: r.description != null ? String(r.description) : undefined,
      raw: r,
    };
  });
}

/**
 * @param {object} [opts]
 * @param {Record<string, string|undefined>} [opts.env]
 * @param {(url: string, init: object) => Promise<{ status: number, body: unknown, headers?: object }>} [opts.httpGet]
 * @returns {Promise<{ programmes: object[], publisherId: string }>}
 */
async function fetchJoinedProgrammes(opts = {}) {
  const env = opts.env || process.env;
  const { token, publisherId, baseUrl } = readAwinCreds(env);
  const httpGet = opts.httpGet;
  if (typeof httpGet !== 'function') {
    throw new AwinOnboardingError(
      'missing_httpGet',
      'fetchJoinedProgrammes requires injectable opts.httpGet',
    );
  }

  const url = `${baseUrl}/publishers/${encodeURIComponent(publisherId)}/programmes?relationship=joined`;
  const res = await httpGet(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const status = res && typeof res.status === 'number' ? res.status : 0;
  if (status < 200 || status >= 300) {
    throw new AwinOnboardingError(
      'awin_http_error',
      `Awin programmes HTTP ${status}`,
    );
  }
  const programmes = normalizeProgrammes(res.body);
  return { programmes, publisherId };
}

module.exports = {
  fetchJoinedProgrammes,
  readAwinCreds,
  normalizeProgrammes,
  AwinOnboardingError,
  DEFAULT_BASE,
};
