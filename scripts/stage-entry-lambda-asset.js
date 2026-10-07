'use strict';

/**
 * FR-037: stage entry Lambda asset so runtime can require providers/*
 * (Code.fromAsset(entry/src) alone cannot resolve ../../providers).
 *
 * Layout (asset root):
 *   entry/src/**           handler entry/src/index.handler
 *   providers/registry.json
 *   providers/loadRegistry.js
 *   providers/queueName.js
 *   providers/resolveQueueUrl.js
 *
 * No .env / secrets. Optional: copies @aws-sdk/client-sqs from repo
 * node_modules when present (enqueue dep).
 */

const fs = require('node:fs');
const path = require('node:path');

const PROVIDER_FILES = [
  'registry.json',
  'loadRegistry.js',
  'queueName.js',
  'resolveQueueUrl.js',
];

/**
 * @param {string} [repoRoot]
 * @param {{ outDir?: string }} [opts]
 * @returns {string} absolute path to staged asset root
 */
function stageEntryLambdaAsset(repoRoot, opts) {
  const root = repoRoot || path.join(__dirname, '..');
  const outDir =
    (opts && opts.outDir) || path.join(root, 'cdk', 'entry-lambda-asset');

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const entrySrc = path.join(root, 'entry', 'src');
  const entryDest = path.join(outDir, 'entry', 'src');
  fs.cpSync(entrySrc, entryDest, { recursive: true });

  const providersDest = path.join(outDir, 'providers');
  fs.mkdirSync(providersDest, { recursive: true });
  for (const name of PROVIDER_FILES) {
    const from = path.join(root, 'providers', name);
    if (!fs.existsSync(from)) {
      throw new Error(`stage-entry-lambda-asset: missing ${from}`);
    }
    fs.copyFileSync(from, path.join(providersDest, name));
  }

  // Enqueue uses @aws-sdk/client-sqs — include from root install when available.
  const sdkSrc = path.join(root, 'node_modules', '@aws-sdk');
  if (fs.existsSync(sdkSrc)) {
    fs.cpSync(sdkSrc, path.join(outDir, 'node_modules', '@aws-sdk'), {
      recursive: true,
    });
  }
  const smithySrc = path.join(root, 'node_modules', '@smithy');
  if (fs.existsSync(smithySrc)) {
    fs.cpSync(smithySrc, path.join(outDir, 'node_modules', '@smithy'), {
      recursive: true,
    });
  }
  // Common transitive packages used by client-sqs (best-effort; synth tests do not require network).
  for (const pkg of ['tslib', 'bowser', 'fast-xml-parser', 'strnum']) {
    const p = path.join(root, 'node_modules', pkg);
    if (fs.existsSync(p)) {
      fs.cpSync(p, path.join(outDir, 'node_modules', pkg), { recursive: true });
    }
  }

  // Marker for tests / operators
  fs.writeFileSync(
    path.join(outDir, '.a-search-entry-asset.json'),
    JSON.stringify(
      {
        fr: '037',
        handler: 'entry/src/index.handler',
        providers: PROVIDER_FILES,
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
function requiredEntryAssetPaths() {
  return [
    'entry/src/index.js',
    'entry/src/enqueue.js',
    'providers/registry.json',
    'providers/loadRegistry.js',
    'providers/queueName.js',
    'providers/resolveQueueUrl.js',
  ];
}

if (require.main === module) {
  const out = stageEntryLambdaAsset();
  console.log(out);
}

module.exports = {
  stageEntryLambdaAsset,
  requiredEntryAssetPaths,
  PROVIDER_FILES,
};