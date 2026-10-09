'use strict';

/**
 * FR-132: stage awin/impact onboarding Lambda assets so runtime can require
 * ../../../../../shared/identity/userId (and related shared helpers).
 *
 * CDK previously used Code.fromAsset(<onboarding>/src) with handler handler.handler.
 * That zip has no shared/ tree, so relative requires break in Lambda.
 *
 * Layout (asset root), preserving monorepo-relative requires from src/*.js:
 *   providers/local/<id>/onboarding/src/**
 *   shared/**               including shared/identity/userId.js
 *
 * Handler string: providers/local/<id>/onboarding/src/handler.handler (posix).
 */

const fs = require('node:fs');
const path = require('node:path');

/** @type {readonly string[]} */
const ONBOARDING_FOLDERS = Object.freeze([
  'providers/local/awin/onboarding',
  'providers/local/impact/onboarding',
]);

/**
 * @param {string} folder e.g. providers/local/awin/onboarding
 * @returns {string} posix handler
 */
function onboardingHandlerPath(folder) {
  const folderPosix = String(folder || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  if (!folderPosix) {
    throw new Error('onboardingHandlerPath: folder required');
  }
  return `${folderPosix}/src/handler.handler`;
}

/**
 * @param {string} [repoRoot]
 * @param {string} folder providers/local/<id>/onboarding
 * @param {{ outDir?: string }} [opts]
 * @returns {string} absolute path to staged asset root
 */
function stageOnboardingLambdaAsset(repoRoot, folder, opts) {
  const folderPosix = String(folder || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  if (!folderPosix) {
    throw new Error('stageOnboardingLambdaAsset: folder required');
  }
  if (!ONBOARDING_FOLDERS.includes(folderPosix)) {
    throw new Error(
      `stageOnboardingLambdaAsset: unsupported folder ${JSON.stringify(folderPosix)}`,
    );
  }

  const root = repoRoot || path.join(__dirname, '..');
  const id = folderPosix.split('/')[2]; // awin | impact
  const outDir =
    (opts && opts.outDir) ||
    path.join(root, 'cdk', 'onboarding-lambda-asset', id);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const onboardingSrc = path.join(root, ...folderPosix.split('/'), 'src');
  if (!fs.existsSync(onboardingSrc)) {
    throw new Error(`stage-onboarding-lambda-asset: missing ${onboardingSrc}`);
  }
  const onboardingDest = path.join(outDir, ...folderPosix.split('/'), 'src');
  fs.mkdirSync(path.dirname(onboardingDest), { recursive: true });
  fs.cpSync(onboardingSrc, onboardingDest, { recursive: true });

  const sharedSrc = path.join(root, 'shared');
  if (!fs.existsSync(sharedSrc)) {
    throw new Error(`stage-onboarding-lambda-asset: missing ${sharedSrc}`);
  }
  fs.cpSync(sharedSrc, path.join(outDir, 'shared'), { recursive: true });

  fs.writeFileSync(
    path.join(outDir, '.a-search-onboarding-asset.json'),
    JSON.stringify(
      {
        fr: '132',
        id,
        folder: folderPosix,
        handler: onboardingHandlerPath(folderPosix),
        shared: true,
        identity: 'shared/identity/userId.js',
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  return outDir;
}

/**
 * @param {string} folder
 * @returns {string[]}
 */
function requiredOnboardingAssetPaths(folder) {
  const folderPosix = String(folder).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return [
    `${folderPosix}/src/handler.js`,
    'shared/identity/userId.js',
  ];
}

if (require.main === module) {
  const folder =
    process.argv[2] || 'providers/local/awin/onboarding';
  console.log(stageOnboardingLambdaAsset(undefined, folder));
}

module.exports = {
  stageOnboardingLambdaAsset,
  onboardingHandlerPath,
  requiredOnboardingAssetPaths,
  ONBOARDING_FOLDERS,
};
