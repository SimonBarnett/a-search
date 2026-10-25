'use strict';

/**
 * FR #4881: npm run deploy wires IAM smoke-deploy after cdk via cdk-deploy-with-smoke.
 * Stubbed spawn only - no live AWS / network.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const WRAPPER = path.join(ROOT, 'scripts', 'cdk-deploy-with-smoke.js');
const SMOKE = path.join(ROOT, 'scripts', 'smoke-deploy.js');
const PKG = path.join(ROOT, 'package.json');

describe('FR #4881 cdk deploy with smoke', () => {
  it('package.json deploy script includes cdk-deploy-with-smoke wrapper', () => {
    const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
    const deploy = String(pkg.scripts && pkg.scripts.deploy);
    assert.match(deploy, /cdk-deploy-with-smoke\.js/);
    assert.match(deploy, /fill-madeira-ssm-env/);
    assert.match(deploy, /stage-entry/);
    assert.ok(pkg.scripts['smoke-deploy'], 'manual smoke-deploy script kept');
    assert.doesNotMatch(deploy, /A_SEARCH_SMOKE_JWT/);
  });

  it('wrapper exports runCdkDeployWithSmoke and invokes smoke after cdk 0', () => {
    assert.ok(fs.existsSync(WRAPPER), 'scripts/cdk-deploy-with-smoke.js missing');
    const {
      runCdkDeployWithSmoke,
      parseArgs,
      resolveStackName,
      DEFAULT_STACK,
    } = require(WRAPPER);

    const parsed = parseArgs([
      '--app',
      'node cdk/bin/a-search.js',
      'ASearchStack',
      '-c',
      'requireDeployEnv=true',
      '-c',
      'region=eu-west-2',
    ]);
    assert.equal(parsed.region, 'eu-west-2');
    assert.equal(
      resolveStackName({ cdkArgs: parsed.cdkArgs, env: {} }),
      'ASearchStack',
    );
    assert.equal(DEFAULT_STACK, 'ASearchStack');

    const calls = [];
    const spawn = (cmd, args, opts) => {
      calls.push({
        cmd: String(cmd),
        args: (args || []).map(String),
        cwd: opts && opts.cwd,
      });
      return { status: 0, stdout: '', stderr: '' };
    };

    const out = runCdkDeployWithSmoke({
      argv: [
        '--app',
        'node cdk/bin/a-search.js',
        'ASearchStack',
        '-c',
        'requireDeployEnv=true',
        '-c',
        'region=eu-west-2',
      ],
      spawn,
      cwd: ROOT,
      env: { ...process.env, A_SEARCH_SMOKE_JWT: '' },
      nodePath: process.execPath,
    });
    assert.equal(out.ok, true);
    assert.equal(out.stackName, 'ASearchStack');
    assert.equal(out.region, 'eu-west-2');
    assert.equal(out.cdkStatus, 0);
    assert.equal(out.smokeStatus, 0);
    assert.equal(calls.length, 2);

    assert.equal(calls[0].cmd, 'npx');
    assert.deepEqual(calls[0].args.slice(0, 3), [
      '--no-install',
      'cdk',
      'deploy',
    ]);
    assert.ok(calls[0].args.includes('ASearchStack'));

    assert.equal(calls[1].cmd, process.execPath);
    assert.equal(calls[1].args[0], SMOKE);
    assert.ok(calls[1].args.includes('--stack'));
    assert.ok(calls[1].args.includes('ASearchStack'));
    assert.ok(calls[1].args.includes('--region'));
    assert.ok(calls[1].args.includes('eu-west-2'));
  });

  it('wrapper fails the whole run when smoke-deploy is non-zero', () => {
    const { runCdkDeployWithSmoke } = require(WRAPPER);
    let n = 0;
    const spawn = (cmd, args) => {
      n += 1;
      if (n === 1) {
        assert.equal(String(cmd), 'npx');
        return { status: 0 };
      }
      assert.equal(String(cmd), process.execPath);
      assert.ok(String(args[0]).endsWith('smoke-deploy.js'));
      return { status: 7 };
    };
    const out = runCdkDeployWithSmoke({
      argv: ['ASearchStack'],
      spawn,
      cwd: ROOT,
      env: process.env,
      nodePath: process.execPath,
    });
    assert.equal(out.ok, false);
    assert.equal(out.cdkStatus, 0);
    assert.equal(out.smokeStatus, 7);
  });

  it('wrapper skips smoke when cdk deploy is non-zero', () => {
    const { runCdkDeployWithSmoke } = require(WRAPPER);
    const calls = [];
    const spawn = (cmd) => {
      calls.push(String(cmd));
      return { status: 2 };
    };
    const out = runCdkDeployWithSmoke({
      argv: ['--stack', 'ASearchStack', '-c', 'requireDeployEnv=true'],
      spawn,
      cwd: ROOT,
      env: process.env,
      nodePath: process.execPath,
    });
    assert.equal(out.ok, false);
    assert.equal(out.cdkStatus, 2);
    assert.equal(out.smokeStatus, null);
    assert.deepEqual(calls, ['npx']);
  });

  it('smoke-deploy still has no A_SEARCH_SMOKE_JWT / Bearer (pin #4888)', () => {
    const text = fs.readFileSync(SMOKE, 'utf8');
    assert.doesNotMatch(text, /A_SEARCH_SMOKE_JWT/);
    assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9._\-]+/);
    assert.match(text, /SigV4|signExecuteApiRequest|AWS4-HMAC-SHA256/);
    assert.match(text, /SearchApiUrl|resolveSearchApiUrl/);
  });

  it('docs mention CDK deploy smoke / SearchApiUrl / SigV4 without hand-set A_SEARCH_API_URL for deploy path', () => {
    const deployDoc = fs.readFileSync(path.join(ROOT, 'docs', 'deploy.md'), 'utf8');
    assert.match(deployDoc, /FR #4881|cdk-deploy-with-smoke/);
    assert.match(deployDoc, /SearchApiUrl/);
    assert.match(deployDoc, /SigV4|IAM/);
    assert.match(
      deployDoc,
      /No hand-set `A_SEARCH_API_URL`|no hand-set `A_SEARCH_API_URL`/i,
    );

    const checklist = fs.readFileSync(
      path.join(ROOT, 'docs', 'release-checklist.md'),
      'utf8',
    );
    assert.match(checklist, /FR #4881|cdk-deploy-with-smoke|included in `npm run deploy`/);
    assert.match(checklist, /SearchApiUrl|SigV4|IAM/);
  });
});
