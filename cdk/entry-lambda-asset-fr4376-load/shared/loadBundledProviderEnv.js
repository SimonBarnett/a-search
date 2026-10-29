'use strict';

/**
 * Load a provider `.env` that was copied into the Lambda asset.
 * Existing process.env keys win. Values are never logged.
 * @param {string} providerSrcDir directory of the provider src/*.js file
 * @param {Record<string, string|undefined>} [target]
 * @returns {string[]} keys applied
 */
function applyBundledProviderEnv(providerSrcDir, target) {
  const fs = require('node:fs');
  const path = require('node:path');
  const env = target || process.env;
  const filePath = path.join(providerSrcDir, '..', '.env');
  if (!fs.existsSync(filePath)) return [];
  let text = '';
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`provider env: unreadable file ${filePath}`);
  }
  const applied = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (env[key] != null && String(env[key]).length > 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
    applied.push(key);
  }
  return applied;
}

module.exports = { applyBundledProviderEnv };
