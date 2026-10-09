#!/usr/bin/env node
'use strict';

const cdk = require('aws-cdk-lib');
const { ASearchStack } = require('../lib/a-search-stack');
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

new ASearchStack(app, 'ASearchStack', {
  env: {
    account: deployEnv.account,
    region: deployEnv.region,
  },
});
