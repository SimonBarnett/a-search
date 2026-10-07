'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REGISTRY_PATH = path.join(__dirname, 'registry.json');

/**
 * Load providers/registry.json (all shortlist sources).
 * @returns {{ sources: Array<{ id: string, kind: string, folder: string, enabled: { live: boolean, sandbox: boolean }, queueEnv?: string }> }}
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

module.exports = { loadRegistry, enabled };
