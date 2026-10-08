'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REGISTRY_PATH = path.join(__dirname, 'registry.json');

/**
 * Optional per-source pacing hints (FR-058b). Not enforced by CDK here.
 * @typedef {{
 *   maxConcurrency?: number,
 *   messagesPerSecond?: number,
 *   minIntervalMs?: number,
 * }} RateLimit
 */

/**
 * Load providers/registry.json (all shortlist sources).
 * @returns {{ sources: Array<{
 *   id: string,
 *   kind: string,
 *   folder: string,
 *   enabled: { live: boolean, sandbox: boolean },
 *   queueEnv?: string,
 *   rateLimit?: RateLimit,
 * }> }}
 */
function loadRegistry() {
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.sources)) {
    throw new Error('providers/registry.json missing sources[]');
  }
  return data;
}

/**
 * Ids enabled for the given env (live|sandbox).
 * @param {'live'|'sandbox'} env
 * @returns {string[]}
 */
function enabled(env) {
  if (env !== 'live' && env !== 'sandbox') {
    throw new Error(`enabled(env): env must be 'live' or 'sandbox', got ${JSON.stringify(env)}`);
  }
  const { sources } = loadRegistry();
  return sources
    .filter((s) => s && s.enabled && s.enabled[env] === true)
    .map((s) => s.id);
}

/**
 * Optional rateLimit for a source id (FR-058b). Undefined when unset.
 * @param {string} id
 * @returns {RateLimit|undefined}
 */
function rateLimit(id) {
  const { sources } = loadRegistry();
  const src = sources.find((s) => s && s.id === id);
  if (!src || src.rateLimit == null || typeof src.rateLimit !== 'object') {
    return undefined;
  }
  return src.rateLimit;
}

module.exports = { loadRegistry, enabled, rateLimit };
