#!/usr/bin/env node
'use strict';

/**
 * FR #3968: deploy app for APartsGateway only (isolated from the main search stack).
 */

const cdk = require('aws-cdk-lib');
const { PartsGatewayStack } = require('../lib/parts-gateway-stack');
const { resolveDeployEnv } = require('../lib/resolve-deploy-env');

const app = new cdk.App();

let deployEnv;
try {
  deployEnv = resolveDeployEnv({
    context: {
      account: app.node.tryGetContext('account'),
      deployAccount: app.node.tryGetContext('deployAccount'),
      region: app.node.tryGetContext('region'),
      deployRegion: app.node.tryGetContext('deployRegion'),
      requireDeployEnv: app.node.tryGetContext('requireDeployEnv'),
    },
  });
} catch (err) {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}

new PartsGatewayStack(app, 'APartsGateway', {
  env: {
    account: deployEnv.account,
    region: deployEnv.region,
  },
  description: 'FR #3968 standalone parts-widget gateway (a-clubs S3)',
});
