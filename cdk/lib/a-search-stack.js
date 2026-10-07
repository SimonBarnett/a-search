'use strict';

const path = require('node:path');
const cdk = require('aws-cdk-lib');
const lambda = require('aws-cdk-lib/aws-lambda');
const sqs = require('aws-cdk-lib/aws-sqs');
const events = require('aws-cdk-lib/aws-events');
const targets = require('aws-cdk-lib/aws-events-targets');
const apigwv2 = require('aws-cdk-lib/aws-apigatewayv2');
const integrations = require('aws-cdk-lib/aws-apigatewayv2-integrations');
const { Construct } = require('constructs');

/**
 * FR-023/024/035: entry Lambda + API Gateway POST /search + amazon
 * live/sandbox queues + maintainer EventBridge schedules.
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

    // FR-035: HTTP API POST /search → entry (JWT still verified in Lambda)
    const httpApi = new apigwv2.HttpApi(this, 'SearchHttpApi', {
      apiName: 'a-search',
      description: 'a-search POST /search → entry Lambda',
    });
    httpApi.addRoutes({
      path: '/search',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'EntrySearchIntegration',
        entry,
      ),
    });

    // FR-024: separate maintainer Lambdas so A_SEARCH_ENV is fixed per target
    const maintainerCode = lambda.Code.fromAsset(
      path.join(__dirname, '..', '..', 'maintainer', 'src'),
    );
    const maintainerLive = new lambda.Function(this, 'MaintainerLiveFunction', {
      functionName: 'a-search-maintainer-live',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'schedule.handler',
      code: maintainerCode,
      timeout: cdk.Duration.minutes(5),
      environment: {
        A_SEARCH_ENV: 'live',
        MAINTAINER_TOP: '10',
      },
    });
    const maintainerSandbox = new lambda.Function(
      this,
      'MaintainerSandboxFunction',
      {
        functionName: 'a-search-maintainer-sandbox',
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'schedule.handler',
        code: maintainerCode,
        timeout: cdk.Duration.minutes(5),
        environment: {
          A_SEARCH_ENV: 'sandbox',
          MAINTAINER_TOP: '10',
        },
      },
    );

    // Default proposal: every 15 minutes (MAINTAINER_INTERVAL_MINUTES)
    const schedule = events.Schedule.rate(cdk.Duration.minutes(15));
    new events.Rule(this, 'MaintainerLiveSchedule', {
      ruleName: 'a-search-maintainer-live',
      description: 'Roll Parts feeds for A_SEARCH_ENV=live',
      schedule,
      targets: [new targets.LambdaFunction(maintainerLive)],
    });
    new events.Rule(this, 'MaintainerSandboxSchedule', {
      ruleName: 'a-search-maintainer-sandbox',
      description: 'Roll Parts feeds for A_SEARCH_ENV=sandbox',
      schedule,
      targets: [new targets.LambdaFunction(maintainerSandbox)],
    });

    new cdk.CfnOutput(this, 'AmazonLiveQueueUrl', { value: amazonLive.queueUrl });
    new cdk.CfnOutput(this, 'AmazonSandboxQueueUrl', {
      value: amazonSandbox.queueUrl,
    });
    new cdk.CfnOutput(this, 'EntryFunctionName', { value: entry.functionName });
    new cdk.CfnOutput(this, 'SearchApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'HTTP API base URL (POST {url}/search)',
    });
    new cdk.CfnOutput(this, 'MaintainerLiveFunctionName', {
      value: maintainerLive.functionName,
    });
    new cdk.CfnOutput(this, 'MaintainerSandboxFunctionName', {
      value: maintainerSandbox.functionName,
    });
  }
}

module.exports = { ASearchStack };
