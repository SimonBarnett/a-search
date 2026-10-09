'use strict';

/** docs/mrb-1111: hostile pins for FR-134 worker S3 SDK staging (PR #1111). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('MRB #1111 hostile FR-134 stage worker @aws-sdk/client-s3', () => {
  it('stage-provider-worker copies @aws-sdk + @smithy and marks awsSdkS3/fr134', () => {
    const s = read('scripts/stage-provider-worker-lambda-asset.js');
    assert.match(s, /FR-134/);
    assert.match(s, /@aws-sdk\/client-s3/);
    assert.match(s, /node_modules['"],\s*['"]@aws-sdk/);
    assert.match(s, /node_modules['"],\s*['"]@smithy/);
    assert.match(s, /awsSdkS3/);
    assert.match(s, /fr134:\s*['"]node_modules\/@aws-sdk\/client-s3['"]/);
    assert.match(s, /['"]node_modules\/@aws-sdk\/client-s3['"]/);
    assert.match(s, /tslib|bowser|fast-xml-parser|strnum/);
  });

  it('product fr134 pin asserts amazon staged client-s3 + release-gap FR-134', () => {
    const t = read('tests/fr134-stage-worker-s3-sdk.test.js');
    assert.match(t, /requiredWorkerAssetPaths/);
    assert.match(t, /node_modules\/@aws-sdk\/client-s3/);
    assert.match(t, /awsSdkS3/);
    assert.match(t, /require\.resolve\(['"]@aws-sdk\/client-s3['"]/);
    assert.match(t, /FR-134/);
    assert.match(t, /Worker zip includes `@aws-sdk\\\/client-s3`/);
    assert.match(t, /FR-134/);
    assert.match(t, /@smithy/);
  });

  it('release-gap worker zip Partial FR-134; onboarding shared Yes after FR-132', () => {
    const gap = read('docs/release-gap-aws-installable-2026-10-09.md');
    assert.match(
      gap,
      /Worker zip includes `@aws-sdk\/client-s3`[\s\S]{0,200}FR-134/,
    );
    assert.match(
      gap,
      /Worker zip includes `@aws-sdk\/client-s3`[\s\S]{0,220}FR-135/,
    );
    assert.match(
      gap,
      /Onboarding zip includes `shared\/`\s*\|\s*\*\*Yes\*\*.*FR-132/i,
    );
  });
});