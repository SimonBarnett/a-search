'use strict';

const path = require('node:path');
const cdk = require('aws-cdk-lib');
const lambda = require('aws-cdk-lib/aws-lambda');
const sqs = require('aws-cdk-lib/aws-sqs');
const events = require('aws-cdk-lib/aws-events');
const targets = require('aws-cdk-lib/aws-events-targets');
<<<<<<< HEAD
const { SqsEventSource } = require('aws-cdk-lib/aws-lambda-event-sources');
=======
const apigwv2 = require('aws-cdk-lib/aws-apigatewayv2');
const integrations = require('aws-cdk-lib/aws-apigatewayv2-integrations');
>>>>>>> origin/main
const { Construct } = require('constructs');
const { loadRegistry } = require('../../providers/loadRegistry');
const { queueName } = require('../../providers/queueName');

/**
<<<<<<< HEAD
 * Title-case construct id fragment from source id (amazon → Amazon).
 * @param {string} id
 */
function pascalSource(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Registry queueEnv `SQS_AMAZON_URL` → entry env keys SQS_AMAZON_LIVE_URL /
 * SQS_AMAZON_SANDBOX_URL (FR-034 resolveQueueUrl preferred keys).
 * @param {string} queueEnv
 * @param {'live'|'sandbox'} env
 */
function queueUrlEnvKey(queueEnv, env) {
  const m = /^SQS_(.+)_URL$/i.exec(String(queueEnv || '').trim());
  if (!m) {
    throw new Error(`bad queueEnv ${JSON.stringify(queueEnv)}`);
  }
  return `SQS_${m[1]}_${env.toUpperCase()}_URL`;
}

/**
 * FR-023/024/036: entry Lambda + per-enabled-source live/sandbox queues +
 * SQS-triggered worker Lambdas + maintainer EventBridge schedules.
=======
 * FR-023/024/035: entry Lambda + API Gateway POST /search + amazon
 * live/sandbox queues + maintainer EventBridge schedules.
>>>>>>> origin/main
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

    const { sources } = loadRegistry();
    const enabledSources = sources.filter(
      (s) =>
        s &&
        s.enabled &&
        (s.enabled.live === true || s.enabled.sandbox === true),
    );

    /** @type {Record<string, string>} */
    const entryEnv = {
      A_SEARCH_ENV: 'sandbox',
    };

    const entry = new lambda.Function(this, 'EntryFunction', {
      functionName: 'a-search-entry',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'entry', 'src')),
      timeout: cdk.Duration.seconds(30),
      environment: entryEnv,
    });

    // FR-036: queues + workers for every enabled shortlist source × env
    for (const src of enabledSources) {
      const folderAbs = path.join(__dirname, '..', '..', src.folder, 'src');
      const pascal = pascalSource(src.id);
      const envs = /** @type {Array<'live'|'sandbox'>} */ (
        ['live', 'sandbox'].filter((e) => src.enabled[e] === true)
      );

      for (const env of envs) {
        const qName = queueName(src.id, env);
        const envPascal = env === 'live' ? 'Live' : 'Sandbox';
        const queue = new sqs.Queue(this, `${pascal}${envPascal}Queue`, {
          queueName: qName,
          visibilityTimeout: cdk.Duration.seconds(60),
        });

        const urlKey = queueUrlEnvKey(src.queueEnv, env);
        entry.addEnvironment(urlKey, queue.queueUrl);
        queue.grantSendMessages(entry);

        const worker = new lambda.Function(
          this,
          `${pascal}${envPascal}WorkerFunction`,
          {
            functionName: `a-search-${src.id}-worker-${env}`,
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'worker.handler',
            code: lambda.Code.fromAsset(folderAbs),
            timeout: cdk.Duration.seconds(60),
            environment: {
              A_SEARCH_ENV: env,
            },
          },
        );
        worker.addEventSource(
          new SqsEventSource(queue, {
            batchSize: 1,
          }),
        );

        new cdk.CfnOutput(this, `${pascal}${envPascal}QueueUrl`, {
          value: queue.queueUrl,
        });
        new cdk.CfnOutput(this, `${pascal}${envPascal}WorkerFunctionName`, {
          value: worker.functionName,
        });
      }
    }

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

module.exports = { ASearchStack, queueUrlEnvKey, pascalSource };
