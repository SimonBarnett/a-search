#!/usr/bin/env node
'use strict';

/**
 * FR #3999: deploy app for AAffiliates only (isolated from the main search stack).
 */

const cdk = require('aws-cdk-lib');
const { AffiliatesStack } = require('../lib/affiliates-stack');
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

new AffiliatesStack(app, 'AAffiliates', {
  env: {
    account: deployEnv.account,
    region: deployEnv.region,
  },
  description:
    'FR #3999 standalone a-affiliates bucket + weekly parts download Lambda',
});
