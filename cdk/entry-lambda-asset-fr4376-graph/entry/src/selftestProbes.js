'use strict';

/**
 * FR-152: load enabled-provider selftestProbe modules for the entry orchestrator.
 * Resolves providers/<kind>/<id>/src/selftestProbe.js relative to the monorepo
 * (and the staged entry Lambda asset layout).
 */

const path = require('node:path');
const { loadRegistry } = require('../../providers/loadRegistry');

/**
 * @param {string} sourceId
 * @param {object} mod
 * @returns {(source: string, deps?: object) => Promise<object>|object}
 */
function pickProbeFn(sourceId, mod) {
  if (!mod || typeof mod !== 'object') {
    throw new TypeError(`selftestProbe module missing for ${sourceId}`);
  }
  const preferred = `${sourceId}SelftestProbe`;
  if (typeof mod[preferred] === 'function') {
    return mod[preferred];
  }
  const named = Object.keys(mod).find(
    (k) => k.endsWith('SelftestProbe') && typeof mod[k] === 'function',
  );
  if (named) return mod[named];
  if (typeof mod.probe === 'function') return mod.probe;
  throw new TypeError(
    `selftestProbe for ${sourceId} exports no *SelftestProbe function`,
  );
}

/**
 * Build an orchestrator-facing probe(source) that requires each provider module.
 *
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   loadRegistry?: typeof loadRegistry,
 *   requireProbe?: (folder: string) => object,
 *   probeDeps?: object,
 * }} [opts]
 * @returns {(source: string) => Promise<{ ok: boolean, source: string, latencyMs: number, error?: string }>}
 */
function createRegistrySelftestProbe(opts = {}) {
  const load = opts.loadRegistry || loadRegistry;
  const envBag = opts.env || process.env;
  const extraDeps = opts.probeDeps || {};

  /** @type {Map<string, Function>} */
  const cache = new Map();

  function resolveFn(sourceId) {
    if (cache.has(sourceId)) return cache.get(sourceId);

    const { sources } = load();
    const src = sources.find((s) => s && s.id === sourceId);
    if (!src || !src.folder) {
      const missing = async () => ({
        ok: false,
        source: String(sourceId),
        latencyMs: 0,
        error: 'unknown_source',
      });
      cache.set(sourceId, missing);
      return missing;
    }

    let mod;
    if (typeof opts.requireProbe === 'function') {
      mod = opts.requireProbe(src.folder);
    } else {
      const probePath = path.join(
        __dirname,
        '..',
        '..',
        ...String(src.folder).replace(/\\/g, '/').split('/'),
        'src',
        'selftestProbe.js',
      );
      // eslint-disable-next-line import/no-dynamic-require, global-require
      mod = require(probePath);
    }

    const fn = pickProbeFn(sourceId, mod);
    const wrapped = async (source) =>
      fn(source, { env: envBag, ...extraDeps });
    cache.set(sourceId, wrapped);
    return wrapped;
  }

  return async function registrySelftestProbe(source) {
    const id = String(source);
    try {
      const fn = resolveFn(id);
      return await fn(id);
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String(/** @type {{ message: unknown }} */ (err).message)
          : 'probe_load_failed';
      return {
        ok: false,
        source: id,
        latencyMs: 0,
        error: msg.slice(0, 200) || 'probe_load_failed',
      };
    }
  };
}

module.exports = {
  createRegistrySelftestProbe,
  pickProbeFn,
};
