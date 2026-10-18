'use strict';

/**
 * FR #3968: stage parts-gateway Lambda zip contents.
 * Layout:
 *   parts-gateway/src/**
 *   shared/identity/**
 *   shared/widgets/hostFolderMeta.js + widgetPath.js + parts.js (PartsError)
 *   shared/components/customers.js (normalizeHost)
 *   node_modules/@aws-sdk/client-s3 (when present)
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {string} [repoRoot]
 * @param {{ outDir?: string }} [opts]
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

  const sdkSrc = path.join(root, 'node_modules', '@aws-sdk');
  if (fs.existsSync(sdkSrc)) {
    const sdkDest = path.join(outDir, 'node_modules', '@aws-sdk');
    fs.mkdirSync(sdkDest, { recursive: true });
    for (const name of ['client-s3', 'types', 'middleware-sdk-s3']) {
      const from = path.join(sdkSrc, name);
      if (fs.existsSync(from)) {
        fs.cpSync(from, path.join(sdkDest, name), { recursive: true });
      }
    }
    // Copy smithy / credential deps lightly when present (Lambda runtime may
    // still need a fuller tree --- deploy uses npm bundle via asset).
    const nm = path.join(root, 'node_modules');
    for (const name of [
      '@smithy',
      'tslib',
      'bowser',
      'fast-xml-parser',
      'strnum',
    ]) {
      const from = path.join(nm, name);
      if (fs.existsSync(from)) {
        fs.cpSync(from, path.join(outDir, 'node_modules', name), {
          recursive: true,
        });
      }
    }
  }

  fs.writeFileSync(
    path.join(outDir, 'package.json'),
    `${JSON.stringify({ name: 'parts-gateway-lambda', private: true, type: 'commonjs' }, null, 2)}\n`,
    'utf8',
  );

  return outDir;
}

if (require.main === module) {
  const out = stagePartsGatewayLambdaAsset();
  process.stdout.write(`${out}\n`);
}

module.exports = {
  stagePartsGatewayLambdaAsset,
};
