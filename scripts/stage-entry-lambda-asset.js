'use strict';

/**
 * FR-037: stage entry Lambda asset so runtime can require providers/*
 * (Code.fromAsset(entry/src) alone cannot resolve ../../providers).
 * FR-415: also stage shared/ so entry can require ../../shared/intake/reportException.
 * FR-152: stage enabled providers' src/selftestProbe.js trees (+ fixtures) so
 * /selftest can require probe modules from the zip.
 *
 * Layout (asset root):
 *   entry/src/**           handler entry/src/index.handler
 *   providers/registry.json
 *   providers/loadRegistry.js
 *   providers/queueName.js
 *   providers/resolveQueueUrl.js
 *   providers/<kind>/<id>/src/**   enabled selftest probes (FR-152)
 *   shared/**              intake/reportException + selftest/ + rest
 *
 * No .env / secrets. Optional: copies @aws-sdk/client-sqs from repo
 * node_modules when present (enqueue dep).
 * FR-151: copies node_modules/jose for JWT_JWKS_URL (createRemoteJWKSet).
 * Local MSSQL driver is NOT staged here (keeps synth under the 180s
 * runCdkSynth pin); local probes fail closed if mssql is missing at runtime.
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
 * Sources enabled for live or sandbox (union) — probes staged for /selftest.
 * @param {string} root
 * @returns {Array<{ id: string, folder: string }>}
 */
function enabledSelftestSources(root) {
  const registryPath = path.join(root, 'providers', 'registry.json');
  const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const sources = Array.isArray(data.sources) ? data.sources : [];
  return sources.filter(
    (s) =>
      s &&
      s.id &&
      s.folder &&
      s.enabled &&
      (s.enabled.live === true || s.enabled.sandbox === true),
  );
}

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

  // FR-415: entry/src requires ../../shared/intake/reportException — copy shared/.
  const sharedSrc = path.join(root, 'shared');
  if (!fs.existsSync(sharedSrc)) {
    throw new Error(`stage-entry-lambda-asset: missing ${sharedSrc}`);
  }
  fs.cpSync(sharedSrc, path.join(outDir, 'shared'), { recursive: true });

  // FR-152: stage enabled provider src (+ fixtures) for selftestProbe requires.
  const selftestSources = enabledSelftestSources(root);
  /** @type {string[]} */
  const stagedProbeIds = [];
  for (const src of selftestSources) {
    const folderPosix = String(src.folder).replace(/\\/g, '/');
    const providerSrc = path.join(root, ...folderPosix.split('/'), 'src');
    const probeFile = path.join(providerSrc, 'selftestProbe.js');
    if (!fs.existsSync(probeFile)) {
      throw new Error(
        `stage-entry-lambda-asset: enabled source ${src.id} missing ${probeFile}`,
      );
    }
    const providerDest = path.join(outDir, ...folderPosix.split('/'), 'src');
    fs.mkdirSync(path.dirname(providerDest), { recursive: true });
    fs.cpSync(providerSrc, providerDest, { recursive: true });

    const fixturesSrc = path.join(root, ...folderPosix.split('/'), 'fixtures');
    if (fs.existsSync(fixturesSrc)) {
      const fixturesDest = path.join(
        outDir,
        ...folderPosix.split('/'),
        'fixtures',
      );
      fs.cpSync(fixturesSrc, fixturesDest, { recursive: true });
    }

    stagedProbeIds.push(String(src.id));
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

  // FR-151: JWT_JWKS_URL path in entry/src/auth/jwt.js requires jose at runtime.
  const joseSrc = path.join(root, 'node_modules', 'jose');
  if (!fs.existsSync(joseSrc)) {
    throw new Error(
      'stage-entry-lambda-asset: missing node_modules/jose (npm install; FR-151)',
    );
  }
  fs.cpSync(joseSrc, path.join(outDir, 'node_modules', 'jose'), {
    recursive: true,
  });

  // Marker for tests / operators
  fs.writeFileSync(
    path.join(outDir, '.a-search-entry-asset.json'),
    JSON.stringify(
      {
        fr: '037',
        fr152: true,
        handler: 'entry/src/index.handler',
        providers: PROVIDER_FILES,
        shared: true,
        fr415: 'shared/intake/reportException',
        fr151: 'node_modules/jose',
        selftestProbes: stagedProbeIds,
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
    'entry/src/selftestProbes.js',
    'providers/registry.json',
    'providers/loadRegistry.js',
    'providers/queueName.js',
    'providers/resolveQueueUrl.js',
    'providers/live/amazon/src/selftestProbe.js',
    'providers/live/ebay/src/selftestProbe.js',
    'providers/local/awin/src/selftestProbe.js',
    'shared/intake/reportException.js',
    'shared/intake/redact.js',
    'shared/selftest/orchestrator.js',
    'node_modules/jose/package.json',
  ];
}

if (require.main === module) {
  const out = stageEntryLambdaAsset();
  console.log(out);
}

module.exports = {
  stageEntryLambdaAsset,
  requiredEntryAssetPaths,
  enabledSelftestSources,
  PROVIDER_FILES,
};
