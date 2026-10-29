'use strict';

/**
 * docs/mrb-4433 hostile pins for FR #4428 / PR #4433.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  isLambdaContext,
  attachDefaultS3,
  buildDefaultS3Fns,
} = require('../shared/search/liveWorkerS3');

const ROOT = path.join(__dirname, '..');

describe('docs/mrb-4433 hostile FR #4428', () => {
  it('isLambdaContext rejects deps with putObject and accepts awsRequestId context', () => {
    assert.equal(isLambdaContext({ putObject: async () => {} }), false);
    assert.equal(
      isLambdaContext({
        awsRequestId: 'req-1',
        getRemainingTimeInMillis: () => 1000,
      }),
      true,
    );
    assert.equal(isLambdaContext(null), false);
    assert.equal(isLambdaContext([]), false);
  });

  it('attachDefaultS3 keeps injected putObject and fills missing S3 via createS3Client', async () => {
    const injected = {
      putObject: async () => ({ ETag: 'x' }),
      other: 1,
    };
    assert.equal(attachDefaultS3(injected), injected);
    assert.equal(typeof injected.listObjectAnnotations, 'undefined');

    const sends = [];
    const fakeClient = {
      send: async (cmd) => {
        sends.push(cmd && cmd.constructor ? cmd.constructor.name : typeof cmd);
        return {};
      },
    };
    const deps = attachDefaultS3({
      createS3Client: () => fakeClient,
      env: {},
    });
    assert.equal(typeof deps.putObject, 'function');
    assert.equal(typeof deps.headObject, 'function');
    assert.equal(typeof deps.listObjectAnnotations, 'function');
    // Avoid real @aws-sdk Command classes: buildDefaultS3Fns falls back to send(input)
    await deps.putObject({ Bucket: 'b', Key: 'k' });
    assert.ok(sends.length >= 1);
  });

  it('source pins liveWorkerS3 wired into live workers', () => {
    const helper = fs.readFileSync(
      path.join(ROOT, 'shared/search/liveWorkerS3.js'),
      'utf8',
    );
    assert.match(helper, /function attachDefaultS3/);
    assert.match(helper, /function isLambdaContext/);
    assert.match(helper, /FR #4428/);
    const ebay = fs.readFileSync(
      path.join(ROOT, 'providers/live/ebay/src/worker.js'),
      'utf8',
    );
    assert.match(ebay, /attachDefaultS3/);
    const stage = fs.readFileSync(
      path.join(ROOT, 'scripts/stage-provider-worker-lambda-asset.js'),
      'utf8',
    );
    assert.match(stage, /client-s3/);
  });
});
