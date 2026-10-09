'use strict';

/**
 * FR-131: stage maintainer Lambda asset so runtime can require
 * ../../shared/intake/reportException (from maintainer/src/schedule.js).
 *
 * CDK previously used Code.fromAsset(maintainer/src) with handler schedule.handler.
 * That zip has no shared/ tree, so the relative require breaks in Lambda.
 *
 * Layout (asset root), preserving monorepo-relative requires from src/*.js:
 *   maintainer/src/**     e.g. maintainer/src/schedule.js
 *   shared/**             including shared/intake/reportException.js
 *
 * Handler string: maintainer/src/schedule.handler (posix).
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * @returns {string} posix handler
 */
function maintainerHandlerPath() {
  return 'maintainer/src/schedule.handler';
}

/**
 * @param {string} [repoRoot]
 * @param {{ outDir?: string }} [opts]
 * @returns {string} absolute path to staged asset root
 */
function stageMaintainerLambdaAsset(repoRoot, opts) {
  const root = repoRoot || path.join(__dirname, '..');
  const outDir =
    (opts && opts.outDir) || path.join(root, 'cdk', 'maintainer-lambda-asset');

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const maintainerSrc = path.join(root, 'maintainer', 'src');
  if (!fs.existsSync(maintainerSrc)) {
    throw new Error(`stage-maintainer-lambda-asset: missing ${maintainerSrc}`);
  }
  const maintainerDest = path.join(outDir, 'maintainer', 'src');
  fs.mkdirSync(path.dirname(maintainerDest), { recursive: true });
  fs.cpSync(maintainerSrc, maintainerDest, { recursive: true });

  const sharedSrc = path.join(root, 'shared');
  if (!fs.existsSync(sharedSrc)) {
    throw new Error(`stage-maintainer-lambda-asset: missing ${sharedSrc}`);
  }
  fs.cpSync(sharedSrc, path.join(outDir, 'shared'), { recursive: true });

  // mssql/SDK packaging: not required for current maintainer/src (no mssql
  // require). When a later FR adds a hot-path mssql require, stage those
  // packages here (mirror entry's @aws-sdk copy). Skipping keeps synth under
  // the FR-129 runCdkSynth 180s budget.

  fs.writeFileSync(
    path.join(outDir, '.a-search-maintainer-asset.json'),
    JSON.stringify(
      {
        fr: '131',
        handler: maintainerHandlerPath(),
        shared: true,
        reportException: 'shared/intake/reportException.js',
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  return outDir;
}

/**
 * Paths that must exist inside a staged asset (relative to asset root).
 * @returns {string[]}
 */
function requiredMaintainerAssetPaths() {
  return [
    'maintainer/src/schedule.js',
    'maintainer/src/roll.js',
    'maintainer/src/fetch.js',
    'maintainer/src/upsert.js',
    'maintainer/src/delete.js',
    'shared/intake/reportException.js',
    'shared/intake/redact.js',
  ];
}

if (require.main === module) {
  console.log(stageMaintainerLambdaAsset());
}

module.exports = {
  stageMaintainerLambdaAsset,
  maintainerHandlerPath,
  requiredMaintainerAssetPaths,
};
