#!/usr/bin/env node
'use strict';

/**
 * FR #4008: deploy app for AMerchants only (isolated from the main search stack).
 */

const cdk = require('aws-cdk-lib');
const { MerchantsStack } = require('../lib/merchants-stack');
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

new MerchantsStack(app, 'AMerchants', {
  env: {
    account: deployEnv.account,
    region: deployEnv.region,
  },
  description:
    'FR #4008 standalone a-merchants bucket + onCreated + weekly dual-bucket parts download',
});
