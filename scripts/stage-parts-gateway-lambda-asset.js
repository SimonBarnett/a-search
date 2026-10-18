'use strict';

/**
 * FR #3968 / FR #4078: stage parts-gateway Lambda zip contents.
 * Layout:
 *   parts-gateway/src/**
 *   shared/identity/**
 *   shared/widgets/hostFolderMeta.js + widgetPath.js
 *   shared/components/customers.js (normalizeHost)
 *   shared/aClubs/**
 *   node_modules from `npm install` of @aws-sdk/client-s3 + client-sqs
 *   (full transitive tree --- do not cherry-pick SDK packages)
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

/**
 * @param {string} root
 * @returns {{ s3: string, sqs: string }}
 */
function readRootSdkVersions(root) {
  const pkgPath = path.join(root, 'package.json');
  /** @type {{ dependencies?: Record<string, string> }} */
  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    pkg = {};
  }
  const deps = pkg.dependencies || {};
  return {
    s3: deps['@aws-sdk/client-s3'] || '^3.1147.0',
    sqs: deps['@aws-sdk/client-sqs'] || '^3.758.0',
  };
}

/**
 * @param {string} [repoRoot]
 * @param {{ outDir?: string, skipNpmInstall?: boolean, npmInstall?: (cwd: string) => void }} [opts]
 * @returns {string}
 */
function stagePartsGatewayLambdaAsset(repoRoot, opts) {
  const root = repoRoot || path.join(__dirname, '..');
  const outDir =
    (opts && opts.outDir) ||
    path.join(root, 'cdk', 'parts-gateway-lambda-asset');

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const pgSrc = path.join(root, 'parts-gateway', 'src');
  fs.cpSync(pgSrc, path.join(outDir, 'parts-gateway', 'src'), {
    recursive: true,
  });

  const sharedPairs = [
    ['shared/identity', 'shared/identity'],
    ['shared/components/customers.js', 'shared/components/customers.js'],
    ['shared/widgets/hostFolderMeta.js', 'shared/widgets/hostFolderMeta.js'],
    ['shared/widgets/widgetPath.js', 'shared/widgets/widgetPath.js'],
    ['shared/aClubs', 'shared/aClubs'],
  ];
  for (const [fromRel, toRel] of sharedPairs) {
    const from = path.join(root, fromRel);
    const to = path.join(outDir, toRel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (fs.statSync(from).isDirectory()) {
      fs.cpSync(from, to, { recursive: true });
    } else {
      fs.copyFileSync(from, to);
    }
  }

  // FR #4078: install full client-s3 + client-sqs trees into the asset.
  // Cherry-picking @aws-sdk/* from the repo root leaves out transitive deps
  // (@aws-sdk/checksums, @aws/lambda-invoke-store, …) and breaks live GET /parts.
  const versions = readRootSdkVersions(root);
  fs.writeFileSync(
    path.join(outDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'parts-gateway-lambda',
        private: true,
        type: 'commonjs',
        dependencies: {
          '@aws-sdk/client-s3': versions.s3,
          '@aws-sdk/client-sqs': versions.sqs,
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  if (!(opts && opts.skipNpmInstall)) {
    const installer =
      typeof (opts && opts.npmInstall) === 'function'
        ? opts.npmInstall
        : (cwd) => {
            execFileSync(
              'npm',
              ['install', '--omit=dev', '--no-audit', '--no-fund'],
              {
                cwd,
                stdio: 'inherit',
                shell: true,
                env: process.env,
              },
            );
          };
    installer(outDir);
  }

  return outDir;
}

if (require.main === module) {
  const out = stagePartsGatewayLambdaAsset();
  process.stdout.write(`${out}\n`);
}

module.exports = {
  stagePartsGatewayLambdaAsset,
  readRootSdkVersions,
};
