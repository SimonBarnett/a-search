'use strict';

/**
 * FR-157: HttpApi access logs to CloudWatch + stage throttle (context-overridable).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const resolvePath = path.join(root, 'cdk', 'lib', 'resolve-api-throttle.js');
const deployPath = path.join(root, 'docs', 'deploy.md');

describe('FR-157 API access logs + throttle', () => {
  it('stack + resolve-api-throttle + deploy note wire FR-157', () => {
    assert.ok(fs.existsSync(resolvePath));
    const stack = fs.readFileSync(stackPath, 'utf8');
    assert.match(stack, /FR-157/);
    assert.match(stack, /LogGroupLogDestination|accessLogSettings/);
    assert.match(stack, /resolveApiThrottle|throttle:/);
    assert.match(stack, /createDefaultStage:\s*false|HttpStage/);
    const deploy = fs.readFileSync(deployPath, 'utf8');
    assert.match(deploy, /FR-157/);
    assert.match(deploy, /apiThrottleRate|apiThrottleBurst/);
  });

  it('resolveApiThrottle defaults and context overrides', () => {
    const {
      resolveApiThrottle,
      DEFAULT_RATE,
      DEFAULT_BURST,
    } = require('../cdk/lib/resolve-api-throttle');
    assert.deepEqual(resolveApiThrottle({}), {
      rateLimit: DEFAULT_RATE,
      burstLimit: DEFAULT_BURST,
    });
    assert.deepEqual(
      resolveApiThrottle({ apiThrottleRate: '50', apiThrottleBurst: 100 }),
      { rateLimit: 50, burstLimit: 100 },
    );
    assert.throws(
      () => resolveApiThrottle({ apiThrottleRate: 0 }),
      /FR-157/,
    );
    assert.throws(
      () => resolveApiThrottle({ apiThrottleBurst: -1 }),
      /FR-157/,
    );
  });

  it('synth: Stage has AccessLogSettings + DefaultRouteSettings throttle', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr157');
    fs.rmSync(outdir, { recursive: true, force: true });
    const app = new cdk.App({
      outdir,
      context: { apiThrottleRate: '25', apiThrottleBurst: '55' },
    });
    new ASearchStack(app, 'ASearchStack');
    app.synth();

    const tpl = JSON.parse(
      fs.readFileSync(path.join(outdir, 'ASearchStack.template.json'), 'utf8'),
    );
    const resources = Object.values(tpl.Resources || {});

    const stages = resources.filter(
      (r) => r && r.Type === 'AWS::ApiGatewayV2::Stage',
    );
    assert.ok(stages.length >= 1, 'expected HttpApi Stage');
    const stage = stages[0];
    const access = stage.Properties && stage.Properties.AccessLogSettings;
    assert.ok(access && access.DestinationArn, 'AccessLogSettings.DestinationArn');
    assert.ok(access.Format, 'AccessLogSettings.Format');

    const routeSettings =
      stage.Properties && stage.Properties.DefaultRouteSettings;
    assert.ok(routeSettings, 'DefaultRouteSettings required for throttle');
    assert.equal(routeSettings.ThrottlingRateLimit, 25);
    assert.equal(routeSettings.ThrottlingBurstLimit, 55);

    const logGroups = resources.filter(
      (r) => r && r.Type === 'AWS::Logs::LogGroup',
    );
    assert.ok(
      logGroups.some((g) => {
        const name = g.Properties && g.Properties.LogGroupName;
        const ret = g.Properties && g.Properties.RetentionInDays;
        // access log group or any 30d group; pin access via DestinationArn link
        return ret === 30 || (typeof name === 'string' && /access/i.test(name));
      }),
      'expected CloudWatch LogGroup for access logs (30d retention)',
    );
  });
});
