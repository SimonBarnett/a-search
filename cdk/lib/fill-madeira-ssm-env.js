'use strict';

/**
 * Deploy step: write amazon and ebay provider `.env` files from existing
 * `/madeira/*` SSM parameters, then the stack bundles those files.
 * Parameter values are never printed.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MADEIRA_ENV_PARAMS = {
  amazon: [
    ['/madeira/amazon/AMAZON_ACCESS_KEY', 'AMAZON_ACCESS_KEY', true],
    ['/madeira/amazon/AMAZON_SECRET_KEY', 'AMAZON_SECRET_KEY', true],
    ['/madeira/amazon/AMAZON_PARTNER_TAG', 'AMAZON_PARTNER_TAG', true],
    ['/madeira/amazon/AMAZON_HOST', 'AMAZON_HOST', true],
    ['/madeira/amazon/AMAZON_REGION', 'AMAZON_REGION', true],
  ],
  ebay: [
    ['/madeira/ebay/EBAY_CLIENT_ID', 'EBAY_CLIENT_ID', true],
    ['/madeira/ebay/EBAY_CLIENT_SECRET', 'EBAY_CLIENT_SECRET', true],
    ['/madeira/ebay/EBAY_CAMPAIGN_ID', 'EBAY_CAMPAIGN_ID', true],
    ['/madeira/ebay/EBAY_MARKETPLACE_ID', 'EBAY_MARKETPLACE_ID', true],
    ['/madeira/ebay/EBAY_REFRESH_TOKEN', 'EBAY_REFRESH_TOKEN', false],
  ],
};

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
 * }} opts
 * @returns {string[]} files written
 */
function fillMadeiraProviderEnv(opts) {
  if (!opts || typeof opts.getParameter !== 'function') {
    throw new Error('fillMadeiraProviderEnv: getParameter required');
  }
  const repoRoot = opts.repoRoot;
  const written = [];
  for (const [sourceId, rows] of Object.entries(MADEIRA_ENV_PARAMS)) {
    const pairs = [];
    for (const [paramName, envKey, required] of rows) {
      let value;
      try {
        value = opts.getParameter(paramName);
      } catch (err) {
        throw new Error(
          `provider env ${sourceId}: SSM read failed for ${paramName}`,
        );
      }
      const text = value == null ? '' : String(value).trim();
      if (!text) {
        if (required) {
          throw new Error(
            `provider env ${sourceId}: missing SSM parameter ${paramName}`,
          );
        }
        continue;
      }
      pairs.push([envKey, text]);
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
  return written;
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
    throw new Error(`provider env: SSM read failed for ${name}`);
  }
}

function main() {
  const repoRoot = path.join(__dirname, '..', '..');
  const files = fillMadeiraProviderEnv({
    repoRoot,
    getParameter: awsCliGetParameter,
  });
  process.stdout.write(
    `filled ${files.length} provider env files from /madeira SSM\n`,
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  MADEIRA_ENV_PARAMS,
  fillMadeiraProviderEnv,
  renderDotEnv,
};
