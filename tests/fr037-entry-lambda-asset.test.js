'use strict';

/** FR-037: entry Lambda asset includes providers/ */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  stageEntryLambdaAsset,
  requiredEntryAssetPaths,
} = require('../scripts/stage-entry-lambda-asset');

describe('FR-037 entry Lambda packaging', () => {
  it('staged asset lists providers/registry.json and entry handler path', () => {
    const outDir = stageEntryLambdaAsset(root);
    for (const rel of requiredEntryAssetPaths()) {
      assert.ok(
        fs.existsSync(path.join(outDir, rel)),
        `missing staged path ${rel}`,
      );
    }
    const { loadRegistry } = require(path.join(outDir, 'providers', 'loadRegistry.js'));
    const data = loadRegistry();
    assert.ok(Array.isArray(data.sources));
    assert.ok(data.sources.some((s) => s.id === 'amazon'));
  });

  it('fail-when: stack must not point entry code only at entry/src', () => {
    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /stageEntryLambdaAsset/);
    assert.match(stack, /entry\/src\/index\.handler/);
    assert.doesNotMatch(
      stack,
      /handler:\s*'index\.handler'[\s\S]{0,120}fromAsset\([^\)]*entry['\"]\s*,\s*['\"]src['\"]/,
    );
    // bare entry/src asset for EntryFunction must be gone
    assert.doesNotMatch(
      stack,
      /EntryFunction[\s\S]{0,400}fromAsset\(path\.join\(__dirname,\s*'\.\.',\s*'\.\.',\s*'entry',\s*'src'\)\)/,
    );
  });
});