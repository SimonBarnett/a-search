'use strict';

/**
 * FR #3999: stage affiliates weekly Lambda zip contents.
 * Layout:
 *   affiliates/src/**
 *   shared/affiliates/**
 *   node_modules/@aws-sdk/client-s3 (when present)
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {string} [repoRoot]
 * @param {{ outDir?: string }} [opts]
 * @returns {string}
 */
function stageAffiliatesLambdaAsset(repoRoot, opts) {
  const root = repoRoot || path.join(__dirname, '..');
  const outDir =
    (opts && opts.outDir) ||
    path.join(root, 'cdk', 'affiliates-lambda-asset');

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const affSrc = path.join(root, 'affiliates', 'src');
  fs.cpSync(affSrc, path.join(outDir, 'affiliates', 'src'), {
    recursive: true,
  });

  const sharedFrom = path.join(root, 'shared', 'affiliates');
  const sharedTo = path.join(outDir, 'shared', 'affiliates');
  fs.mkdirSync(path.dirname(sharedTo), { recursive: true });
  fs.cpSync(sharedFrom, sharedTo, { recursive: true });

  const sdkSrc = path.join(root, 'node_modules', '@aws-sdk');
  if (fs.existsSync(sdkSrc)) {
    const sdkDest = path.join(outDir, 'node_modules', '@aws-sdk');
    fs.mkdirSync(sdkDest, { recursive: true });
    for (const name of [
      'client-s3',
      'types',
      'middleware-sdk-s3',
    ]) {
      const from = path.join(sdkSrc, name);
      if (fs.existsSync(from)) {
        fs.cpSync(from, path.join(sdkDest, name), { recursive: true });
      }
    }
    const nm = path.join(root, 'node_modules');
    // FR-4409: also stage @aws/lambda-invoke-store (scoped @aws).
    for (const name of [
      '@smithy',
      '@aws',
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
    `${JSON.stringify({ name: 'affiliates-lambda', private: true, type: 'commonjs' }, null, 2)}\n`,
    'utf8',
  );

  return outDir;
}

if (require.main === module) {
  const out = stageAffiliatesLambdaAsset();
  process.stdout.write(`${out}\n`);
}

module.exports = {
  stageAffiliatesLambdaAsset,
};
