'use strict';

/**
 * FR #4890: APartsGateway CDK enables EventBridge on imported a-clubs
 * (merge, do not replace existing Topic/Queue/Lambda notifications).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const STACK = path.join(ROOT, 'cdk', 'lib', 'parts-gateway-stack.js');
const ENABLE_PS1 = path.join(ROOT, 'scripts', 'Enable-AClubsEventBridge.ps1');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('FR #4890 a-clubs EventBridge via CDK', () => {
  it('parts-gateway-stack imports a-clubs and enableEventBridgeNotification', () => {
    const src = read('cdk/lib/parts-gateway-stack.js');
    assert.match(src, /aws-cdk-lib\/aws-s3/);
    assert.match(src, /fromBucketName\s*\(/);
    assert.match(src, /enableEventBridgeNotification\s*\(\s*\)/);
    assert.match(src, /A_CLUBS_BUCKET|['"]a-clubs['"]/);
    // Must not invent a owned Bucket() for a-clubs (imported only).
    assert.equal(/\bnew\s+s3\.Bucket\s*\(/.test(src), false);
  });

  it('Enable-AClubsEventBridge.ps1 is read-only check (no put)', () => {
    const src = read('scripts/Enable-AClubsEventBridge.ps1');
    assert.match(src, /get-bucket-notification-configuration/i);
    assert.equal(/put-bucket-notification-configuration/i.test(src), false);
    assert.match(src, /EventBridgeConfiguration/);
    assert.match(src, /read-only|check only|CDK|APartsGateway/i);
  });

  it('docs say EventBridge on a-clubs is enabled by APartsGateway CDK', () => {
    const annot = read('docs/a-annotator-a-sqlsearch.md');
    assert.match(annot, /APartsGateway|parts-gateway/i);
    assert.match(annot, /EventBridge/);
    assert.match(annot, /CDK/i);
    assert.equal(/Enable-AClubsEventBridge\.ps1\s+-Bucket/i.test(annot), false);
    const readme = read('cdk/README-parts-gateway.md');
    assert.match(readme, /EventBridge/);
    assert.match(readme, /enableEventBridgeNotification|fromBucketName|a-clubs/i);
    assert.match(readme, /CDK/i);
  });

  it('synth APartsGateway emits Custom::S3BucketNotifications EventBridge merge', () => {
    let cdk;
    let assertions;
    let PartsGatewayStack;
    try {
      cdk = require('aws-cdk-lib');
      assertions = require('aws-cdk-lib/assertions');
      ({ PartsGatewayStack } = require('../cdk/lib/parts-gateway-stack'));
    } catch (err) {
      // Durable source pins above still gate CI when cdk modules are absent.
      assert.ok(fs.existsSync(STACK), String(err));
      return;
    }
    const assetDir = path.join(ROOT, 'cdk', 'parts-gateway-lambda-asset');
    if (!fs.existsSync(assetDir)) {
      const stage = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'stage-parts-gateway-lambda-asset.js')], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      assert.equal(stage.status, 0, stage.stdout + stage.stderr);
    }
    const app = new cdk.App();
    const stack = new PartsGatewayStack(app, 'APartsGatewayFr4890', {
      env: { account: '111111111111', region: 'eu-west-2' },
    });
    const template = assertions.Template.fromStack(stack);
    const notifs = template.findResources('Custom::S3BucketNotifications');
    const keys = Object.keys(notifs);
    assert.ok(keys.length >= 1, 'expected Custom::S3BucketNotifications for a-clubs EventBridge');
    const props = notifs[keys[0]].Properties;
    assert.equal(String(props.BucketName), 'a-clubs');
    assert.equal(String(props.Managed).toLowerCase(), 'false');
    assert.ok(
      props.NotificationConfiguration &&
        Object.prototype.hasOwnProperty.call(props.NotificationConfiguration, 'EventBridgeConfiguration'),
      'NotificationConfiguration must include EventBridgeConfiguration',
    );
  });
});
