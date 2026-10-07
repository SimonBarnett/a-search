#!/usr/bin/env node
'use strict';

const cdk = require('aws-cdk-lib');
const { ASearchStack } = require('../lib/a-search-stack');

const app = new cdk.App();
new ASearchStack(app, 'ASearchStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'eu-west-2',
  },
});
