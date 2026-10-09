'use strict';

/**
 * FR-141: npm run deploy + account/region context (no hardcoded account IDs).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const resolvePath = path.join(root, 'cdk', 'lib', 'resolve-deploy-env.js');

describe('FR-141 npm deploy + account/region context', () => {
  it('package.json deploy script wraps cdk deploy with requireDeployEnv', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    );
    assert.ok(pkg.scripts && pkg.scripts.deploy, 'scripts.deploy missing');
    assert.match(pkg.scripts.deploy, /cdk deploy/);
    assert.match(pkg.scripts.deploy, /requireDeployEnv/);
    assert.match(pkg.scripts.deploy, /ASearchStack/);
    assert.match(pkg.scripts.deploy, /cdk\/bin\/a-search\.js/);
  });

  it('resolveDeployEnv fails clearly when requireDeployEnv and account missing', () => {
    const { resolveDeployEnv } = require(resolvePath);
    assert.throws(
      () =>
        resolveDeployEnv({
          context: { requireDeployEnv: true },
          env: {},
        }),
      (err) =>
        err &&
        err.code === 'A_SEARCH_MISSING_DEPLOY_ACCOUNT' &&
        /FR-141/.test(err.message) &&
        /account/i.test(err.message),
    );

    const ok = resolveDeployEnv({
      context: { account: '111122223333', region: 'eu-west-1', requireDeployEnv: true },
      env: {},
    });
    assert.equal(ok.account, '111122223333');
    assert.equal(ok.region, 'eu-west-1');

    const fromEnv = resolveDeployEnv({
      context: { requireDeployEnv: 'true' },
      env: { CDK_DEFAULT_ACCOUNT: '999988887777', CDK_DEFAULT_REGION: 'us-east-1' },
    });
    assert.equal(fromEnv.account, '999988887777');
    assert.equal(fromEnv.region, 'us-east-1');

    // Synth path: account optional when requireDeployEnv unset
    const synth = resolveDeployEnv({ context: {}, env: {} });
    assert.equal(synth.account, undefined);
    assert.equal(synth.region, 'eu-west-2');
  });

  it('bin uses resolveDeployEnv; no hardcoded 12-digit account IDs in deploy sources', () => {
    const bin = fs.readFileSync(
      path.join(root, 'cdk', 'bin', 'a-search.js'),
      'utf8',
    );
    assert.match(bin, /resolveDeployEnv/);
    assert.match(bin, /tryGetContext\(\s*['"]account['"]\s*\)/);
    assert.match(bin, /tryGetContext\(\s*['"]region['"]\s*\)/);
    assert.match(bin, /requireDeployEnv/);

    const resolveSrc = fs.readFileSync(resolvePath, 'utf8');
    assert.doesNotMatch(resolveSrc, /\b\d{12}\b/);
    assert.doesNotMatch(bin, /\b\d{12}\b/);

    const cdkJson = fs.readFileSync(
      path.join(root, 'cdk', 'cdk.json'),
      'utf8',
    );
    assert.doesNotMatch(cdkJson, /\b\d{12}\b/);
  });

  it('docs mention npm run deploy + -c account/region (FR-141)', () => {
    const cdkReadme = fs.readFileSync(
      path.join(root, 'cdk', 'README.md'),
      'utf8',
    );
    assert.match(cdkReadme, /FR-141|npm run deploy/);
    assert.match(cdkReadme, /-c account=|account.*region/i);
    assert.match(cdkReadme, /requireDeployEnv/);

    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-141.md'), 'utf8');
    assert.match(fr, /Decision|LOCKED/i);
    assert.match(fr, /requireDeployEnv|resolveDeployEnv/i);

    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-aws-installable-2026-10-09.md'),
      'utf8',
    );
    assert.match(
      gap,
      /npm run deploy[^\n]*\*\*Yes\*\*|account-region[^\n]*\*\*Yes\*\*[^\n]*FR-141/i,
    );
  });

  it('check script exits non-zero when requireDeployEnv set and account missing', () => {
    const runner = path.join(root, 'scripts', 'fr141-check-deploy-env.js');
    assert.ok(fs.existsSync(runner), 'scripts/fr141-check-deploy-env.js missing');
    const rFail = spawnSync(process.execPath, [runner], {
      cwd: root,
      env: {
        ...process.env,
        A_SEARCH_REQUIRE_DEPLOY_ENV: '1',
        CDK_DEFAULT_ACCOUNT: '',
        CDK_DEFAULT_REGION: '',
      },
      encoding: 'utf8',
    });
    assert.notEqual(
      rFail.status,
      0,
      `expected fail, got ${rFail.status}: ${rFail.stdout} ${rFail.stderr}`,
    );
    assert.match(`${rFail.stdout}\n${rFail.stderr}`, /FR-141|missing deploy account/i);

    const rOk = spawnSync(
      process.execPath,
      [runner, '--account', '123456789012'],
      {
        cwd: root,
        env: {
          ...process.env,
          A_SEARCH_REQUIRE_DEPLOY_ENV: '1',
          CDK_DEFAULT_ACCOUNT: '',
        },
        encoding: 'utf8',
      },
    );
    assert.equal(rOk.status, 0, rOk.stderr || rOk.stdout);
  });
});
