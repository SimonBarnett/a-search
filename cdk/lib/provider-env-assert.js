'use strict';

/**
 * FR #4560: assert enabled provider .env has required key names (never values).
 */

const fs = require('node:fs');

/** Keys that must be non-empty in the bundled .env for search to run. */
const BUNDLED_ENV_REQUIRED = {
  amazon: [
    'AMAZON_ACCESS_KEY',
    'AMAZON_SECRET_KEY',
    'AMAZON_PARTNER_TAG',
    'AMAZON_HOST',
    'AMAZON_REGION',
  ],
  ebay: [
    'EBAY_CLIENT_ID',
    'EBAY_CLIENT_SECRET',
    'EBAY_CAMPAIGN_ID',
    'EBAY_MARKETPLACE_ID',
  ],
  etsy: ['ETSY_API_KEY'],
  rakuten: ['RAKUTEN_CLIENT_ID', 'RAKUTEN_CLIENT_SECRET', 'RAKUTEN_SID'],
  cj: ['CJ_API_TOKEN', 'CJ_COMPANY_ID', 'CJ_WEBSITE_ID'],
  kelkoo: ['KELKOO_API_KEY', 'KELKOO_PUBLISHER_ID'],
};

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseDotEnv(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      throw new Error('provider env: invalid line');
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * @param {string} sourceId
 * @returns {string[]}
 */
function requiredBundledEnvKeys(sourceId) {
  return (BUNDLED_ENV_REQUIRED[sourceId] || []).slice();
}

/**
 * @param {string} filePath
 * @param {string} sourceId
 * @param {string[]} [keys]
 */
function assertProviderEnvFileKeys(filePath, sourceId, keys) {
  const required =
    Array.isArray(keys) && keys.length
      ? keys
      : requiredBundledEnvKeys(sourceId);
  if (!required.length) return;
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `provider env ${sourceId}: missing file ${filePath}. Fill providers/live/${sourceId}/.env from .env.example. Required: ${required.join(', ')}`,
    );
  }
  let parsed;
  try {
    parsed = parseDotEnv(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`provider env ${sourceId}: invalid line in ${filePath}`);
  }
  const missing = required.filter((key) => !String(parsed[key] || '').trim());
  if (missing.length) {
    throw new Error(
      `provider env ${sourceId}: missing required ${missing.join(', ')} in ${filePath}`,
    );
  }
}

/**
 * FR #4650: missing or incomplete bundled .env must not fail synth.
 * Keep Lambda/queue/DLQ; omit fan-out when not ok (provider off for /search).
 * Message names keys/paths only - never values.
 * @param {string} filePath
 * @param {string} sourceId
 * @param {string[]} [keys]
 * @returns {{ ok: boolean, message?: string, missingKeys: string[] }}
 */
function softCheckProviderEnvFileKeys(filePath, sourceId, keys) {
  const required =
    Array.isArray(keys) && keys.length
      ? keys
      : requiredBundledEnvKeys(sourceId);
  if (!required.length) {
    return { ok: true, missingKeys: [] };
  }
  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      missingKeys: required.slice(),
      message: `provider env ${sourceId}: missing file ${filePath}. Fill providers/live/${sourceId}/.env from .env.example. Required: ${required.join(', ')}`,
    };
  }
  let parsed;
  try {
    parsed = parseDotEnv(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {
      ok: false,
      missingKeys: required.slice(),
      message: `provider env ${sourceId}: invalid line in ${filePath}`,
    };
  }
  const missing = required.filter((key) => !String(parsed[key] || '').trim());
  if (missing.length) {
    return {
      ok: false,
      missingKeys: missing,
      message: `provider env ${sourceId}: missing required ${missing.join(', ')} in ${filePath}`,
    };
  }
  return { ok: true, missingKeys: [] };
}

module.exports = {
  BUNDLED_ENV_REQUIRED,
  parseDotEnv,
  requiredBundledEnvKeys,
  assertProviderEnvFileKeys,
  softCheckProviderEnvFileKeys,
};
