'use strict';

/**
 * MRB #5010 / FR #4881: hostile pins for cdk-deploy-with-smoke in npm run deploy.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const WRAPPER = path.join(ROOT, 'scripts', 'cdk-deploy-with-smoke.js');
const SMOKE = path.join(ROOT, 'scripts', 'smoke-deploy.js');
const PKG = path.join(ROOT, 'package.json');

describe('MRB #5010 hostile FR #4881 deploy smoke', () => {
  it('package.json deploy ends with cdk-deploy-with-smoke (not bare cdk)', () => {
    const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
    const deploy = String(pkg.scripts.deploy);
    assert.match(deploy, /cdk-deploy-with-smoke\.js/);
    assert.doesNotMatch(deploy, /npx --no-install cdk deploy/);
    assert.doesNotMatch(deploy, /A_SEARCH_SMOKE_JWT/);
    assert.ok(pkg.scripts['smoke-deploy']);
  });

  it('wrapper fails closed when smoke non-zero and skips smoke when cdk fails', () => {
    const { runCdkDeployWithSmoke } = require(WRAPPER);
    let n = 0;
    const smokeFail = runCdkDeployWithSmoke({
      argv: ['ASearchStack'],
      spawn: () => {
        n += 1;
        return { status: n === 1 ? 0 : 9 };
      },
      cwd: ROOT,
      env: process.env,
      nodePath: process.execPath,
    });
    assert.equal(smokeFail.ok, false);
    assert.equal(smokeFail.smokeStatus, 9);

    const calls = [];
    const cdkFail = runCdkDeployWithSmoke({
      argv: ['ASearchStack'],
      spawn: (cmd) => {
        calls.push(String(cmd));
        return { status: 3 };
      },
      cwd: ROOT,
      env: process.env,
      nodePath: process.execPath,
    });
    assert.equal(cdkFail.ok, false);
    assert.equal(cdkFail.smokeStatus, null);
    assert.deepEqual(calls, ['npx']);
  });

  it('smoke-deploy remains SigV4 SearchApiUrl with no JWT env needle', () => {
    const text = fs.readFileSync(SMOKE, 'utf8');
    assert.doesNotMatch(text, /A_SEARCH_SMOKE_JWT/);
    assert.match(text, /SigV4|signExecuteApiRequest|AWS4-HMAC-SHA256/);
    assert.match(text, /SearchApiUrl|resolveSearchApiUrl/);
  });

  it('deploy.md pins FR #4881 automatic smoke without hand-set A_SEARCH_API_URL', () => {
    const text = fs.readFileSync(path.join(ROOT, 'docs', 'deploy.md'), 'utf8');
    assert.match(text, /FR #4881|cdk-deploy-with-smoke/);
    assert.match(text, /SearchApiUrl/);
    assert.match(
      text,
      /No hand-set `A_SEARCH_API_URL`|no hand-set `A_SEARCH_API_URL`/i,
    );
  });
});
