'use strict';

/**
 * Deploy step: write amazon, ebay, and etsy provider `.env` files from existing
 * `/madeira/*` SSM parameters, then the stack bundles those files.
 * Parameter values are never printed.
 * FR #4650: only fill providers enabled in providers/registry.json (live or sandbox).
 * Missing `/madeira/*` is never an error --- that provider stays off (no `.env` written)
 * and is reported in the deploy warning list (key/path names only).
 * Kelkoo has no /madeira path - operator supplies providers/live/kelkoo/.env or stays off.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Real account paths are kebab-case under /madeira/{amazon,ebay,etsy}/ (FR #4504 / FR #4510).
// Env keys stay SCREAMING_SNAKE for the provider .env; associate-tag -> PARTNER_TAG.
const MADEIRA_ENV_PARAMS = {
  amazon: [
    ['/madeira/amazon/access-key', 'AMAZON_ACCESS_KEY', true],
    ['/madeira/amazon/secret-key', 'AMAZON_SECRET_KEY', true],
    ['/madeira/amazon/associate-tag', 'AMAZON_PARTNER_TAG', true],
    ['/madeira/amazon/host', 'AMAZON_HOST', true],
    ['/madeira/amazon/region', 'AMAZON_REGION', true],
    // FR #4584 / #4562: Creators API credential (optional until PutParameter exists).
    ['/madeira/amazon/creators-credential', 'AMAZON_CREATORS_CREDENTIAL', false],
  ],
  ebay: [
    ['/madeira/ebay/client-id', 'EBAY_CLIENT_ID', true],
    ['/madeira/ebay/client-secret', 'EBAY_CLIENT_SECRET', true],
    ['/madeira/ebay/campaign-id', 'EBAY_CAMPAIGN_ID', true],
    ['/madeira/ebay/marketplace-id', 'EBAY_MARKETPLACE_ID', true],
    // Optional: Browse client-credentials does not need it; ParameterNotFound -> skip.
    ['/madeira/ebay/refresh-token', 'EBAY_REFRESH_TOKEN', false],
  ],
  // FR #4510: PutParameter SecureString; fill writes providers/live/etsy/.env (gitignored).
  etsy: [
    ['/madeira/etsy/api-key', 'ETSY_API_KEY', true],
    ['/madeira/etsy/shared-secret', 'ETSY_SHARED_SECRET', false],
  ],
};

/**
 * @param {{
 *   repoRoot: string,
 *   enabledSourceIds?: string[],
 *   registryPath?: string,
 * }} opts
 * @returns {Set<string>}
 */
function resolveEnabledMadeiraSourceIds(opts) {
  if (Array.isArray(opts.enabledSourceIds)) {
    return new Set(opts.enabledSourceIds.map(String));
  }
  const registryPath =
    opts.registryPath ||
    path.join(opts.repoRoot, 'providers', 'registry.json');
  if (!fs.existsSync(registryPath)) {
    // Temp test roots without a registry: fill every MADEIRA source (legacy).
    return new Set(Object.keys(MADEIRA_ENV_PARAMS));
  }
  const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const enabled = new Set();
  for (const src of data.sources || []) {
    if (!src || !src.id) continue;
    if (src.enabled && (src.enabled.live === true || src.enabled.sandbox === true)) {
      enabled.add(String(src.id));
    }
  }
  return enabled;
}

function renderDotEnv(pairs) {
  const lines = [
    '# Generated at deploy from /madeira/* SSM. Gitignored. Do not commit.',
  ];
  for (const [key, value] of pairs) {
    const safe = String(value).replace(/\r?\n/g, '');
    lines.push(`${key}=${safe}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * @param {{
 *   repoRoot: string,
 *   getParameter: (name: string) => string|null|undefined,
 *   enabledSourceIds?: string[],
 *   registryPath?: string,
 * }} opts
 * @returns {{ written: string[], disabled: Array<{ id: string, missingKeys: string[] }> }}
 */
function fillMadeiraProviderEnv(opts) {
  if (!opts || typeof opts.getParameter !== 'function') {
    throw new Error('fillMadeiraProviderEnv: getParameter required');
  }
  const repoRoot = opts.repoRoot;
  const enabledIds = resolveEnabledMadeiraSourceIds(opts);
  const written = [];
  /** @type {Array<{ id: string, missingKeys: string[] }>} */
  const disabled = [];
  for (const [sourceId, rows] of Object.entries(MADEIRA_ENV_PARAMS)) {
    if (!enabledIds.has(sourceId)) continue;
    const pairs = [];
    /** @type {string[]} */
    const missingKeys = [];
    for (const [paramName, envKey, required] of rows) {
      let value = '';
      try {
        value = opts.getParameter(paramName);
      } catch {
        // FR #4650: missing / unreadable SSM is never a deploy error.
        value = '';
      }
      const text = value == null ? '' : String(value).trim();
      if (!text) {
        if (required) missingKeys.push(paramName);
        continue;
      }
      pairs.push([envKey, text]);
    }
    if (missingKeys.length) {
      disabled.push({ id: sourceId, missingKeys });
      continue;
    }
    const filePath = path.join(
      repoRoot,
      'providers',
      'live',
      sourceId,
      '.env',
    );
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, renderDotEnv(pairs), 'utf8');
    written.push(filePath);
  }
  return { written, disabled };
}

/**
 * @param {Array<{ id: string, missingKeys: string[] }>} disabled
 * @returns {string}
 */
function formatDisabledProvidersWarning(disabled) {
  if (!Array.isArray(disabled) || !disabled.length) return '';
  const parts = disabled.map((row) => {
    const keys = (row.missingKeys || []).join(', ');
    return `${row.id}: missing ${keys}`;
  });
  return `[a-search] providers disabled (missing credentials): ${parts.join('; ')}`;
}

function awsCliGetParameter(name) {
  try {
    const out = execFileSync(
      'aws',
      [
        'ssm',
        'get-parameter',
        '--name',
        name,
        '--with-decryption',
        '--query',
        'Parameter.Value',
        '--output',
        'text',
        '--region',
        process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-2',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return String(out || '').trim();
  } catch (err) {
    const stderr = err && err.stderr ? String(err.stderr) : '';
    if (/ParameterNotFound/i.test(stderr)) return '';
    // FR #4650: treat other SSM failures as missing (provider off), not deploy fail.
    return '';
  }
}

function main() {
  const repoRoot = path.join(__dirname, '..', '..');
  const { written, disabled } = fillMadeiraProviderEnv({
    repoRoot,
    getParameter: awsCliGetParameter,
  });
  process.stdout.write(
    `filled ${written.length} provider env files from /madeira SSM\n`,
  );
  const warn = formatDisabledProvidersWarning(disabled);
  if (warn) {
    process.stderr.write(warn + '\n');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  MADEIRA_ENV_PARAMS,
  fillMadeiraProviderEnv,
  renderDotEnv,
  resolveEnabledMadeiraSourceIds,
  formatDisabledProvidersWarning,
};
