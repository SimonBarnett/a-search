'use strict';

const path = require('node:path');
const cdk = require('aws-cdk-lib');
const lambda = require('aws-cdk-lib/aws-lambda');
const sqs = require('aws-cdk-lib/aws-sqs');
const { Construct } = require('constructs');

/**
 * FR-023 skeleton: entry Lambda + one live/sandbox queue pair (amazon).
 * Queue names match providers/queueName.js: a-search-{source}-{env}.
 */
class ASearchStack extends cdk.Stack {
  /**
   * @param {Construct} scope
   * @param {string} id
   * @param {cdk.StackProps} [props]
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const amazonLive = new sqs.Queue(this, 'AmazonLiveQueue', {
      queueName: 'a-search-amazon-live',
      visibilityTimeout: cdk.Duration.seconds(60),
    });
    const amazonSandbox = new sqs.Queue(this, 'AmazonSandboxQueue', {
      queueName: 'a-search-amazon-sandbox',
      visibilityTimeout: cdk.Duration.seconds(60),
    });

    const entry = new lambda.Function(this, 'EntryFunction', {
      functionName: 'a-search-entry',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'entry', 'src')),
      timeout: cdk.Duration.seconds(30),
      environment: {
        A_SEARCH_ENV: 'sandbox',
        SQS_AMAZON_LIVE_URL: amazonLive.queueUrl,
        SQS_AMAZON_SANDBOX_URL: amazonSandbox.queueUrl,
      },
    });

    amazonLive.grantSendMessages(entry);
    amazonSandbox.grantSendMessages(entry);

    new cdk.CfnOutput(this, 'AmazonLiveQueueUrl', { value: amazonLive.queueUrl });
    new cdk.CfnOutput(this, 'AmazonSandboxQueueUrl', {
      value: amazonSandbox.queueUrl,
    });
    new cdk.CfnOutput(this, 'EntryFunctionName', { value: entry.functionName });
  }
}

module.exports = { ASearchStack };
