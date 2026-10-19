'use strict';

/**
 * FR #4463: load / validate providers/local/{id}/provider.json against schema + registry.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SEARCH_PROVIDER_IDS = new Set([
  'amazon',
  'ebay',
  'rakuten',
  'cj',
  'kelkoo',
  'etsy',
]);

/**
 * @param {string} repoRoot
 */
function registryPath(repoRoot) {
  return path.join(repoRoot, 'providers', 'registry.json');
}

/**
 * @param {string} repoRoot
 */
function schemaPath(repoRoot) {
  return path.join(repoRoot, 'providers', 'import-provider.schema.json');
}

/**
 * @param {string} repoRoot
 */
function loadRegistrySources(repoRoot) {
  const doc = JSON.parse(fs.readFileSync(registryPath(repoRoot), 'utf8'));
  return Array.isArray(doc.sources) ? doc.sources : [];
}

/**
 * Lightweight schema check (no ajv dependency required for walrus runtime).
 * @param {object} doc
 * @returns {string[]} errors
 */
function validateProviderShape(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return ['not_object'];
  if (doc.schemaVersion !== 1) errors.push('schemaVersion');
  if (!doc.provider) errors.push('provider');
  if (!['affiliate', 'merchant'].includes(doc.class)) errors.push('class');
  if (typeof doc.enabled !== 'boolean') errors.push('enabled');
  if (!doc.source || !['a-affiliates', 'a-merchants'].includes(doc.source.bucket)) {
    errors.push('source.bucket');
  }
  if (!doc.source || !doc.source.glob) errors.push('source.glob');
  if (!['csv', 'tsv', 'json', 'jsonl', 'xml'].includes(doc.format)) errors.push('format');
  if (!doc.mapping || typeof doc.mapping !== 'object') errors.push('mapping');
  if (!doc.link || !doc.link.builder) errors.push('link.builder');
  if (!Array.isArray(doc.dedupeKey) || !doc.dedupeKey.length) errors.push('dedupeKey');
  if (!Array.isArray(doc.requiredFields) || !doc.requiredFields.length) {
    errors.push('requiredFields');
  }
  if (!doc.validation || typeof doc.validation !== 'object') errors.push('validation');
  if (!['full', 'incremental'].includes(doc.mode)) errors.push('mode');
  if (!['soft', 'hard', 'none'].includes(doc.deleteMissing)) errors.push('deleteMissing');
  return errors;
}

/**
 * @param {string} repoRoot
 * @returns {{ ok: true, configs: object[] } | { ok: false, errors: string[] }}
 */
function loadAllProviderConfigs(repoRoot) {
  const localRoot = path.join(repoRoot, 'providers', 'local');
  const sources = loadRegistrySources(repoRoot);
  const byId = new Map(sources.map((s) => [s.id, s]));
  const errors = [];
  const configs = [];

  if (!fs.existsSync(localRoot)) {
    return { ok: false, errors: ['missing_providers_local'] };
  }

  for (const id of fs.readdirSync(localRoot)) {
    const dir = path.join(localRoot, id);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (id === 'sql') continue;
    const pj = path.join(dir, 'provider.json');
    if (!fs.existsSync(pj)) {
      // only affiliate/merchant folders require provider.json
      const reg = byId.get(id);
      if (reg && (reg.class === 'affiliate' || reg.class === 'merchant')) {
        errors.push(`${id}:missing_provider_json`);
      }
      continue;
    }
    if (SEARCH_PROVIDER_IDS.has(id)) {
      errors.push(`${id}:search_provider_must_not_have_provider_json`);
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(pj, 'utf8'));
    } catch (e) {
      errors.push(`${id}:json_parse:${e.message}`);
      continue;
    }
    if (doc.provider !== id) errors.push(`${id}:provider_mismatch`);
    const shapeErrs = validateProviderShape(doc);
    for (const e of shapeErrs) errors.push(`${id}:${e}`);
    const reg = byId.get(id);
    if (!reg) errors.push(`${id}:not_in_registry`);
    else if (reg.class !== doc.class) {
      errors.push(`${id}:class_mismatch_registry_${reg.class}`);
    }
    const sha = crypto
      .createHash('sha256')
      .update(fs.readFileSync(pj))
      .digest('hex');
    configs.push({ ...doc, _path: pj, _sha256: sha });
  }

  // search providers must not have provider.json (already checked). Also ensure none of SEARCH list has one under live.
  for (const id of SEARCH_PROVIDER_IDS) {
    const livePj = path.join(repoRoot, 'providers', 'live', id, 'provider.json');
    if (fs.existsSync(livePj)) {
      errors.push(`${id}:live_search_provider_json_forbidden`);
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, configs };
}

module.exports = {
  SEARCH_PROVIDER_IDS,
  validateProviderShape,
  loadAllProviderConfigs,
  loadRegistrySources,
  schemaPath,
};
