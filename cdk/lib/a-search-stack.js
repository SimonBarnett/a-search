'use strict';

const path = require('node:path');
const cdk = require('aws-cdk-lib');
const lambda = require('aws-cdk-lib/aws-lambda');
const sqs = require('aws-cdk-lib/aws-sqs');
const s3 = require('aws-cdk-lib/aws-s3');
const events = require('aws-cdk-lib/aws-events');
const targets = require('aws-cdk-lib/aws-events-targets');
const { SqsEventSource } = require('aws-cdk-lib/aws-lambda-event-sources');
const apigwv2 = require('aws-cdk-lib/aws-apigatewayv2');
const integrations = require('aws-cdk-lib/aws-apigatewayv2-integrations');
const { Construct } = require('constructs');
const { loadRegistry } = require('../../providers/loadRegistry');
const { queueName } = require('../../providers/queueName');
const {
  stageEntryLambdaAsset,
} = require('../../scripts/stage-entry-lambda-asset');
const {
  stageProviderWorkerLambdaAsset,
  workerHandlerPath,
} = require('../../scripts/stage-provider-worker-lambda-asset');
const {
  stageMaintainerLambdaAsset,
  maintainerHandlerPath,
} = require('../../scripts/stage-maintainer-lambda-asset');

/**
 * Title-case construct id fragment from source id (amazon â†’ Amazon).
 * @param {string} id
 */
function pascalSource(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Registry queueEnv `SQS_AMAZON_URL` â†’ entry env keys SQS_AMAZON_LIVE_URL /
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
 * FR-058e/f/g/h/i/j: amazon+ebay+rakuten+cj+awin+impact SQS event-source maxConcurrency
 * from registry rateLimit (safe default). AWS EventSourceMapping ScalingConfig.MaximumConcurrency
 * valid range is 2-1000, so registry 1 clamps to 2. Other providers OOS.
 * @param {{ id?: string, rateLimit?: { maxConcurrency?: number } }} src
 * @returns {number|undefined}
 */
function sqsMaxConcurrencyForSource(src) {
  if (
    !src ||
    (
      src.id !== 'amazon' &&
      src.id !== 'ebay' &&
      src.id !== 'rakuten' &&
      src.id !== 'cj' &&
      src.id !== 'awin' &&
      src.id !== 'impact'
    )
  ) {
    return undefined;
  }
  const n = src.rateLimit && Number(src.rateLimit.maxConcurrency);
  const desired =
    Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  return Math.max(2, Math.min(desired, 1000));
}

/**
 * FR-130: S3_RESULTS_BUCKET env + least-privilege read/write on the results bucket.
 * @param {lambda.Function} fn
 * @param {s3.IBucket} bucket
 */
function wireResultsBucketAccess(fn, bucket) {
  fn.addEnvironment('S3_RESULTS_BUCKET', bucket.bucketName);
  bucket.grantReadWrite(fn);
}

/**
 * FR-023/024/035/036/037: entry Lambda (providers-aware asset) + API Gateway POST /search +
 * per-enabled-source live/sandbox queues + SQS-triggered worker Lambdas +
 * maintainer EventBridge schedules + awin onboarding live/sandbox + impact onboarding live/sandbox Lambdas (FR-056a/b/c/d).
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

    // FR-129: one dedicated results bucket (FR-124 live/sandbox key prefixes).
    // Auto-named - do not invent production account IDs or hard-code bucket names.
    // FR-130 wires env + IAM below. SSE defaults deepen in FR-154.
    const resultsBucket = new s3.Bucket(this, 'ResultsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // FR-037: staged asset includes entry/src + providers/* (not entry/src alone)
    const repoRoot = path.join(__dirname, '..', '..');
    const entryAssetDir = stageEntryLambdaAsset(repoRoot);
    const entry = new lambda.Function(this, 'EntryFunction', {
      functionName: 'a-search-entry',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'entry/src/index.handler',
      code: lambda.Code.fromAsset(entryAssetDir),
      timeout: cdk.Duration.seconds(30),
      environment: entryEnv,
    });
    wireResultsBucketAccess(entry, resultsBucket);

    // FR-036: queues + workers for every enabled shortlist source Ã— env
    for (const src of enabledSources) {
      // FR-444: stage provider src + shared/ so ../../../../shared/* resolves in Lambda
      const workerAssetDir = stageProviderWorkerLambdaAsset(repoRoot, src);
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
            handler: workerHandlerPath(src),
            code: lambda.Code.fromAsset(workerAssetDir),
            timeout: cdk.Duration.seconds(60),
            environment: {
              A_SEARCH_ENV: env,
            },
          },
        );
        wireResultsBucketAccess(worker, resultsBucket);
        const sqsOpts = { batchSize: 1 };
        const maxConcurrency = sqsMaxConcurrencyForSource(src);
        if (maxConcurrency != null) {
          sqsOpts.maxConcurrency = maxConcurrency;
        }
        worker.addEventSource(new SqsEventSource(queue, sqsOpts));

        new cdk.CfnOutput(this, `${pascal}${envPascal}QueueUrl`, {
          value: queue.queueUrl,
        });
        new cdk.CfnOutput(this, `${pascal}${envPascal}WorkerFunctionName`, {
          value: worker.functionName,
        });
      }
    }

    // FR-035: HTTP API POST /search â†’ entry (JWT still verified in Lambda)
    const httpApi = new apigwv2.HttpApi(this, 'SearchHttpApi', {
      apiName: 'a-search',
      description:
        'a-search POST /search + GET|POST /selftest + /account/performance → entry Lambda',
    });
    httpApi.addRoutes({
      path: '/search',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'EntrySearchIntegration',
        entry,
      ),
    });
    // FR-053b: performance stub (JWT verified in Lambda)
    httpApi.addRoutes({
      path: '/account/performance',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'EntryPerformanceIntegration',
        entry,
      ),
    });
    // FR-059b/l: API Gateway /selftest next to /search (JWT in Lambda; probes OOS here)
    httpApi.addRoutes({
      path: '/selftest',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'EntrySelftestIntegration',
        entry,
      ),
    });

    // FR-024: separate maintainer Lambdas so A_SEARCH_ENV is fixed per target
    // FR-131: stage maintainer/src + shared/ so ../../shared/intake/reportException resolves
    const maintainerAssetDir = stageMaintainerLambdaAsset(repoRoot);
    const maintainerCode = lambda.Code.fromAsset(maintainerAssetDir);
    const maintainerLive = new lambda.Function(this, 'MaintainerLiveFunction', {
      functionName: 'a-search-maintainer-live',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: maintainerHandlerPath(),
      code: maintainerCode,
      timeout: cdk.Duration.minutes(5),
      environment: {
        A_SEARCH_ENV: 'live',
        MAINTAINER_TOP: '10',
      },
    });
    wireResultsBucketAccess(maintainerLive, resultsBucket);
    const maintainerSandbox = new lambda.Function(
      this,
      'MaintainerSandboxFunction',
      {
        functionName: 'a-search-maintainer-sandbox',
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: maintainerHandlerPath(),
        code: maintainerCode,
        timeout: cdk.Duration.minutes(5),
        environment: {
          A_SEARCH_ENV: 'sandbox',
          MAINTAINER_TOP: '10',
        },
      },
    );
    wireResultsBucketAccess(maintainerSandbox, resultsBucket);

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

    // FR-056a/b: Awin onboarding live + sandbox Lambdas (A_SEARCH_ENV fixed).
    const awinOnboardingCode = lambda.Code.fromAsset(
      path.join(
        __dirname,
        '..',
        '..',
        'providers',
        'local',
        'awin',
        'onboarding',
        'src',
      ),
    );
    const awinOnboardingLive = new lambda.Function(
      this,
      'AwinOnboardingLiveFunction',
      {
        functionName: 'a-search-awin-onboarding-live',
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'handler.handler',
        code: awinOnboardingCode,
        timeout: cdk.Duration.minutes(5),
        environment: {
          A_SEARCH_ENV: 'live',
        },
      },
    );
    wireResultsBucketAccess(awinOnboardingLive, resultsBucket);
    const awinOnboardingSandbox = new lambda.Function(
      this,
      'AwinOnboardingSandboxFunction',
      {
        functionName: 'a-search-awin-onboarding-sandbox',
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'handler.handler',
        code: awinOnboardingCode,
        timeout: cdk.Duration.minutes(5),
        environment: {
          A_SEARCH_ENV: 'sandbox',
        },
      },
    );
    wireResultsBucketAccess(awinOnboardingSandbox, resultsBucket);

    // FR-056d: Impact onboarding sandbox Lambda (A_SEARCH_ENV fixed).
    const impactOnboardingCode = lambda.Code.fromAsset(
      path.join(
        __dirname,
        '..',
        '..',
        'providers',
        'local',
        'impact',
        'onboarding',
        'src',
      ),
    );
    const impactOnboardingSandbox = new lambda.Function(
      this,
      'ImpactOnboardingSandboxFunction',
      {
        functionName: 'a-search-impact-onboarding-sandbox',
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'handler.handler',
        code: impactOnboardingCode,
        timeout: cdk.Duration.minutes(5),
        environment: {
          A_SEARCH_ENV: 'sandbox',
        },
      },
    );
    wireResultsBucketAccess(impactOnboardingSandbox, resultsBucket);


    // FR-056c: Impact onboarding live Lambda (A_SEARCH_ENV fixed). Schedules → FR-056e.
    const impactOnboardingLive = new lambda.Function(
      this,
      'ImpactOnboardingLiveFunction',
      {
        functionName: 'a-search-impact-onboarding-live',
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'handler.handler',
        code: impactOnboardingCode,
        timeout: cdk.Duration.minutes(5),
        environment: {
          A_SEARCH_ENV: 'live',
        },
      },
    );
    wireResultsBucketAccess(impactOnboardingLive, resultsBucket);

    // FR-056e: daily EventBridge rules for each onboarding Lambda in this stack
    // (clubscan Awin-Onboarding daily intent). Lambda code is out of scope.
    const onboardingSchedule = events.Schedule.rate(cdk.Duration.days(1));
    const awinOnboardingLiveRule = new events.Rule(this, 'AwinOnboardingLiveSchedule', {
      ruleName: 'a-search-awin-onboarding-live',
      description: 'Daily drain for Awin onboarding A_SEARCH_ENV=live',
      schedule: onboardingSchedule,
      targets: [new targets.LambdaFunction(awinOnboardingLive)],
    });
    const awinOnboardingSandboxRule = new events.Rule(
      this,
      'AwinOnboardingSandboxSchedule',
      {
        ruleName: 'a-search-awin-onboarding-sandbox',
        description: 'Daily drain for Awin onboarding A_SEARCH_ENV=sandbox',
        schedule: onboardingSchedule,
        targets: [new targets.LambdaFunction(awinOnboardingSandbox)],
      },
    );
    const impactOnboardingSandboxRule = new events.Rule(
      this,
      'ImpactOnboardingSandboxSchedule',
      {
        ruleName: 'a-search-impact-onboarding-sandbox',
        description: 'Daily drain for Impact onboarding A_SEARCH_ENV=sandbox',
        schedule: onboardingSchedule,
        targets: [new targets.LambdaFunction(impactOnboardingSandbox)],
      },
    );

    new cdk.CfnOutput(this, 'ResultsBucketName', {
      value: resultsBucket.bucketName,
      description:
        'Dedicated a-search results bucket (FR-124 one-bucket; live/ + sandbox/ prefixes)',
    });
    new cdk.CfnOutput(this, 'ResultsBucketArn', {
      value: resultsBucket.bucketArn,
      description: 'ARN of the a-search results bucket (env + IAM = FR-130)',
    });

    new cdk.CfnOutput(this, 'EntryFunctionName', { value: entry.functionName });
    new cdk.CfnOutput(this, 'SearchApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'HTTP API base URL (POST {url}/search; GET|POST {url}/selftest)',
    });
    new cdk.CfnOutput(this, 'MaintainerLiveFunctionName', {
      value: maintainerLive.functionName,
    });
    new cdk.CfnOutput(this, 'MaintainerSandboxFunctionName', {
      value: maintainerSandbox.functionName,
    });
    new cdk.CfnOutput(this, 'AwinOnboardingLiveFunctionName', {
      value: awinOnboardingLive.functionName,
    });
    new cdk.CfnOutput(this, 'AwinOnboardingSandboxFunctionName', {
      value: awinOnboardingSandbox.functionName,
    });
    new cdk.CfnOutput(this, 'ImpactOnboardingSandboxFunctionName', {
      value: impactOnboardingSandbox.functionName,
    });
    new cdk.CfnOutput(this, 'ImpactOnboardingLiveFunctionName', {
      value: impactOnboardingLive.functionName,
    });
    new cdk.CfnOutput(this, 'AwinOnboardingLiveRuleName', {
      value: awinOnboardingLiveRule.ruleName,
    });
    new cdk.CfnOutput(this, 'AwinOnboardingSandboxRuleName', {
      value: awinOnboardingSandboxRule.ruleName,
    });
    new cdk.CfnOutput(this, 'ImpactOnboardingSandboxRuleName', {
      value: impactOnboardingSandboxRule.ruleName,
    });
  }
}

module.exports = {
  ASearchStack,
  queueUrlEnvKey,
  pascalSource,
  wireResultsBucketAccess,
};
