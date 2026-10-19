'use strict';

/**
 * FR-444: stage provider worker Lambda assets so runtime can require
 * ../../../../shared/* (assertEnv, writeResults, intake/reportException).
 * FR-134: also bundle @aws-sdk/client-s3 (+ @smithy) so writeResults PutObject
 * works without a Lambda layer (mirror scripts/stage-entry-lambda-asset.js).
 * FR-135: local providers also stage mssql (+ transitive) for queryParts.
 *
 * CDK previously used Code.fromAsset(<provider>/src) with handler worker.handler.
 * That zip has no shared/ tree, so relative requires break in Lambda.
 *
 * Layout (asset root), preserving monorepo-relative requires from src/*.js:
 *   <src.folder>/src/**     e.g. providers/live/amazon/src/worker.js
 *   shared/**               including shared/intake/reportException.js
 *   worker/lib/**           normalizeProduct (FR #4414; ../../../../worker/lib from src/)
 *   node_modules/@aws-sdk/** (+ @smithy + @aws/lambda-invoke-store + small transitives when present)
 *   node_modules/mssql/**   (providers/local/* only)
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

  // FR #4480: bundle the gitignored provider .env into the asset. The worker
  // reads it at run time. Never log the file contents.
  if (opts && opts.envFile) {
    const envFile = String(opts.envFile);
    if (!fs.existsSync(envFile)) {
      throw new Error(
        `provider env ${src.id}: missing file ${envFile}. Fill providers/live/${src.id}/.env from .env.example.`,
      );
    }
    const envDest = path.join(outDir, ...folderPosix.split('/'), '.env');
    fs.copyFileSync(envFile, envDest);
  }

  const sharedSrc = path.join(root, 'shared');
  if (!fs.existsSync(sharedSrc)) {
    throw new Error(`stage-provider-worker-lambda-asset: missing ${sharedSrc}`);
  }
  fs.cpSync(sharedSrc, path.join(outDir, 'shared'), { recursive: true });

  // FR #4414: amazon (and other providers) require ../../../../worker/lib/normalizeProduct
  // from providers/.../src/*.js --- stage worker/lib at the asset root.
  const workerLibSrc = path.join(root, 'worker', 'lib');
  if (!fs.existsSync(workerLibSrc)) {
    throw new Error(
      `stage-provider-worker-lambda-asset: missing ${workerLibSrc} (FR #4414)`,
    );
  }
  fs.mkdirSync(path.join(outDir, 'worker'), { recursive: true });
  fs.cpSync(workerLibSrc, path.join(outDir, 'worker', 'lib'), {
    recursive: true,
  });

  // FR-134: writeResults uses @aws-sdk/client-s3 — include from root install when available.
  const sdkSrc = path.join(root, 'node_modules', '@aws-sdk');
  let awsSdkS3 = false;
  if (fs.existsSync(sdkSrc)) {
    fs.cpSync(sdkSrc, path.join(outDir, 'node_modules', '@aws-sdk'), {
      recursive: true,
    });
    awsSdkS3 = fs.existsSync(
      path.join(outDir, 'node_modules', '@aws-sdk', 'client-s3'),
    );
  }
  const smithySrc = path.join(root, 'node_modules', '@smithy');
  if (fs.existsSync(smithySrc)) {
    fs.cpSync(smithySrc, path.join(outDir, 'node_modules', '@smithy'), {
      recursive: true,
    });
  }

  // FR-4409: @aws-sdk/core requires @aws/lambda-invoke-store (scoped @aws, not @aws-sdk).
  const invokeStoreSrc = path.join(
    root,
    'node_modules',
    '@aws',
    'lambda-invoke-store',
  );
  if (!fs.existsSync(invokeStoreSrc)) {
    throw new Error(
      'stage-provider-worker-lambda-asset: missing node_modules/@aws/lambda-invoke-store (npm install; FR-4409)',
    );
  }
  fs.mkdirSync(path.join(outDir, 'node_modules', '@aws'), { recursive: true });
  fs.cpSync(
    invokeStoreSrc,
    path.join(outDir, 'node_modules', '@aws', 'lambda-invoke-store'),
    { recursive: true },
  );

  // Common transitive packages used by client-s3 (best-effort; synth tests do not require network).
  for (const pkg of ['tslib', 'bowser', 'fast-xml-parser', 'strnum']) {
    const p = path.join(root, 'node_modules', pkg);
    if (fs.existsSync(p)) {
      fs.cpSync(p, path.join(outDir, 'node_modules', pkg), { recursive: true });
    }
  }

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
        fr134: 'node_modules/@aws-sdk/client-s3',
        id: src.id,
        folder: folderPosix,
        handler: workerHandlerPath(src),
        shared: true,
        workerLib: true,
        awsSdkS3,
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
    'node_modules/@aws/lambda-invoke-store/package.json',
    `${folder}/src/worker.js`,
    'shared/intake/reportException.js',
    'shared/intake/redact.js',
    'shared/assertEnv.js',
    'shared/writeResults.js',
    'worker/lib/normalizeProduct.js',
    'node_modules/@aws-sdk/client-s3',
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
