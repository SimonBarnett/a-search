'use strict';

/**
 * FR-444: stage provider worker Lambda assets so runtime can require
 * ../../../../shared/* (assertEnv, writeResults, intake/reportException).
 *
 * CDK previously used Code.fromAsset(<provider>/src) with handler worker.handler.
 * That zip has no shared/ tree, so relative requires break in Lambda.
 *
 * Layout (asset root), preserving monorepo-relative requires from src/*.js:
 *   <src.folder>/src/**     e.g. providers/live/amazon/src/worker.js
 *   shared/**               including shared/intake/reportException.js
 *
 * Handler string: <src.folder>/src/worker.handler (posix).
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  stageMssqlNodeModules,
  isLocalProviderFolder,
} = require('./stage-mssql-node-modules');

/**
 * @param {{ id: string, folder: string }} src registry source
 * @returns {string} posix handler e.g. providers/live/amazon/src/worker.handler
 */
function workerHandlerPath(src) {
  if (!src || !src.folder) {
    throw new Error('workerHandlerPath: src.folder required');
  }
  const folder = String(src.folder).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return `${folder}/src/worker.handler`;
}

/**
 * @param {string} [repoRoot]
 * @param {{ id: string, folder: string }} src
 * @param {{ outDir?: string }} [opts]
 * @returns {string} absolute path to staged asset root
 */
function stageProviderWorkerLambdaAsset(repoRoot, src, opts) {
  if (!src || !src.id || !src.folder) {
    throw new Error('stageProviderWorkerLambdaAsset: src.id and src.folder required');
  }
  const root = repoRoot || path.join(__dirname, '..');
  const folderPosix = String(src.folder).replace(/\\/g, '/');
  const outDir =
    (opts && opts.outDir) ||
    path.join(root, 'cdk', 'worker-lambda-asset', src.id);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const providerSrc = path.join(root, ...folderPosix.split('/'), 'src');
  if (!fs.existsSync(providerSrc)) {
    throw new Error(`stage-provider-worker-lambda-asset: missing ${providerSrc}`);
  }
  const providerDest = path.join(outDir, ...folderPosix.split('/'), 'src');
  fs.mkdirSync(path.dirname(providerDest), { recursive: true });
  fs.cpSync(providerSrc, providerDest, { recursive: true });

  const sharedSrc = path.join(root, 'shared');
  if (!fs.existsSync(sharedSrc)) {
    throw new Error(`stage-provider-worker-lambda-asset: missing ${sharedSrc}`);
  }
  fs.cpSync(sharedSrc, path.join(outDir, 'shared'), { recursive: true });

  // FR-135: local providers require('mssql') from queryParts — stage driver + deps.
  let mssqlPackages = [];
  if (isLocalProviderFolder(folderPosix)) {
    mssqlPackages = stageMssqlNodeModules(root, outDir).packages;
  }

  fs.writeFileSync(
    path.join(outDir, '.a-search-worker-asset.json'),
    JSON.stringify(
      {
        fr: '444',
        id: src.id,
        folder: folderPosix,
        handler: workerHandlerPath(src),
        shared: true,
        reportException: 'shared/intake/reportException.js',
        mssql: mssqlPackages.length > 0,
        mssqlPackages,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  return outDir;
}

/**
 * @param {{ id: string, folder: string }} src
 * @returns {string[]}
 */
function requiredWorkerAssetPaths(src) {
  const folder = String(src.folder).replace(/\\/g, '/');
  return [
    `${folder}/src/worker.js`,
    'shared/intake/reportException.js',
    'shared/intake/redact.js',
    'shared/assertEnv.js',
    'shared/writeResults.js',
  ];
}

if (require.main === module) {
  const id = process.argv[2] || 'amazon';
  const { loadRegistry } = require('../providers/loadRegistry');
  const src = loadRegistry().sources.find((s) => s.id === id);
  if (!src) {
    console.error(`unknown source id: ${id}`);
    process.exit(1);
  }
  console.log(stageProviderWorkerLambdaAsset(undefined, src));
}

module.exports = {
  stageProviderWorkerLambdaAsset,
  workerHandlerPath,
  requiredWorkerAssetPaths,
};
