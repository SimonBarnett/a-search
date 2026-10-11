'use strict';

const path = require('node:path');
const cdk = require('aws-cdk-lib');
const lambda = require('aws-cdk-lib/aws-lambda');
const sqs = require('aws-cdk-lib/aws-sqs');
const s3 = require('aws-cdk-lib/aws-s3');
const secretsmanager = require('aws-cdk-lib/aws-secretsmanager');
const events = require('aws-cdk-lib/aws-events');
const targets = require('aws-cdk-lib/aws-events-targets');
const logs = require('aws-cdk-lib/aws-logs');
const cloudwatch = require('aws-cdk-lib/aws-cloudwatch');
const cw_actions = require('aws-cdk-lib/aws-cloudwatch-actions');
const sns = require('aws-cdk-lib/aws-sns');
const { SqsEventSource } = require('aws-cdk-lib/aws-lambda-event-sources');
const apigwv2 = require('aws-cdk-lib/aws-apigatewayv2');
const integrations = require('aws-cdk-lib/aws-apigatewayv2-integrations');
const apigw = require('aws-cdk-lib/aws-apigateway');
const { Construct } = require('constructs');
const { resolveApiThrottle } = require('./resolve-api-throttle');
const {
  resolveStageSuffix,
  withStageSuffix,
} = require('./resolve-stage-suffix');
const { resolveCorsOrigins } = require('./resolve-cors-origins');
const { resolveCostTags } = require('./resolve-cost-tags');
/** FR-143: 30-day CloudWatch Logs retention on every Lambda. */
const LOG_RETENTION = logs.RetentionDays.ONE_MONTH;

/**
 * FR-164: worker Lambda timeout (seconds). Queue visibility must be strictly
 * greater; AWS guidance for SQS->Lambda is at least 6x the function timeout.
 */
const WORKER_LAMBDA_TIMEOUT_SEC = 60;
const WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC = WORKER_LAMBDA_TIMEOUT_SEC * 6;

/**
 * FR-165: explicit memorySize floors (default 128MB OOMs on cold JWKS/SDK).
 * Entry JWT + fan-out: 256MB. Marketplace workers: 256MB. Local/MSSQL workers,
 * maintainer, onboarding: 512MB.
 */
const ENTRY_LAMBDA_MEMORY_MB = 256;
const WORKER_LAMBDA_MEMORY_MB = 256;
const WORKER_MSSQL_LAMBDA_MEMORY_MB = 512;
const HEAVY_LAMBDA_MEMORY_MB = 512;

/**
 * FR-143: dedicated LogGroup with 30-day retention (prefer over deprecated logRetention).
 * @param {Construct} scope
 * @param {string} id
 * @returns {logs.LogGroup}
 */
function lambdaLogGroup(scope, id) {
  return new logs.LogGroup(scope, id, {
    retention: LOG_RETENTION,
    removalPolicy: cdk.RemovalPolicy.RETAIN,
  });
}
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
  stageOnboardingLambdaAsset,
  onboardingHandlerPath,
} = require('../../scripts/stage-onboarding-lambda-asset');
const {
  stageMaintainerLambdaAsset,
  maintainerHandlerPath,
} = require('../../scripts/stage-maintainer-lambda-asset');

/**
 * Title-case construct id fragment from source id (amazon Ã¢â€ â€™ Amazon).
 * @param {string} id
 */
function pascalSource(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Registry queueEnv `SQS_AMAZON_URL` Ã¢â€ â€™ entry env keys SQS_AMAZON_LIVE_URL /
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

/**
 * FR-136: resolve entry JWT secret from CDK context `jwtSecretArn`, else create
 * an empty Secrets Manager secret for ops to fill (JSON keys JWT_ISSUER,
 * JWT_AUDIENCE, JWT_JWKS_URL, JWT_SECRET). Never put plaintext JWT values in git.
 * @param {Construct} scope
 * @param {cdk.Stack} stack
 * @returns {secretsmanager.ISecret}
 */
function resolveEntryJwtSecret(scope, stack) {
  const arn = stack.node.tryGetContext('jwtSecretArn');
  if (typeof arn === 'string' && /^arn:aws:secretsmanager:/i.test(arn.trim())) {
    return secretsmanager.Secret.fromSecretCompleteArn(
      scope,
      'EntryJwtSecret',
      arn.trim(),
    );
  }
  return new secretsmanager.Secret(scope, 'EntryJwtSecret', {
    description:
      'a-search entry JWT_* JSON (FR-136). Keys: JWT_ISSUER, JWT_AUDIENCE, JWT_JWKS_URL, JWT_SECRET (optional JWT_HS256_SECRET). Values are deploy-time only.',
  });
}

/**
 * FR-136: wire JWT_* env from Secrets Manager JSON fields + grant read.
 * CloudFormation dynamic refs â€” no secret strings in the synth snapshot.
 * @param {lambda.Function} fn
 * @param {secretsmanager.ISecret} secret
 */
function wireEntryJwtSecrets(fn, secret) {
  const keys = ['JWT_ISSUER', 'JWT_AUDIENCE', 'JWT_JWKS_URL', 'JWT_SECRET'];
  for (const k of keys) {
    fn.addEnvironment(k, secret.secretValueFromJson(k).unsafeUnwrap());
  }
  secret.grantRead(fn);
}

function wireResultsBucketAccess(fn, bucket) {
  fn.addEnvironment('S3_RESULTS_BUCKET', bucket.bucketName);
  bucket.grantReadWrite(fn);
}

const MSSQL_LIVE_DATABASE = 'madeiradb';
const MSSQL_SANDBOX_DATABASE_DEFAULT = '<sandbox-mssql-database>';
/** Synth/deploy placeholder when -c mssqlSecretArn is omitted (never a real account). */
const MSSQL_SECRET_ARN_PLACEHOLDER =
  'arn:aws:secretsmanager:eu-west-2:000000000000:secret:a-search/mssql-fr137-AbCdEf';

/**
 * @param {string} [folder] registry src.folder
 * @returns {boolean}
 */
function isLocalProviderFolder(folder) {
  return String(folder || '')
    .replace(/\\/g, '/')
    .startsWith('providers/local/');
}

/**
 * FR-137: wire MSSQL_* from Secrets Manager JSON onto Lambdas that touch SQL.
 * Secret string JSON keys: SERVER, USER, PASSWORD (optional TRUSTED_CONNECTION / DOMAIN).
 * DATABASE is env-specific plain text (live madeiradb / sandbox placeholder from context).
 * @param {lambda.Function} fn
 * @param {secretsmanager.ISecret} secret
 * @param {{ database: string }} opts
 */
function wireMssqlSecretEnv(fn, secret, opts) {
  const database = opts && opts.database;
  if (!database) {
    throw new Error('wireMssqlSecretEnv: opts.database required');
  }
  fn.addEnvironment(
    'MSSQL_SERVER',
    secret.secretValueFromJson('SERVER').unsafeUnwrap(),
  );
  fn.addEnvironment(
    'MSSQL_USER',
    secret.secretValueFromJson('USER').unsafeUnwrap(),
  );
  fn.addEnvironment(
    'MSSQL_PASSWORD',
    secret.secretValueFromJson('PASSWORD').unsafeUnwrap(),
  );
  fn.addEnvironment('MSSQL_DATABASE', database);
  fn.addEnvironment('MSSQL_ENCRYPT', 'true');
  fn.addEnvironment('MSSQL_TRUST_SERVER_CERTIFICATE', 'true');
  secret.grantRead(fn);
}

/**
 * FR-138: credential env keys from each enabled provider `.env.example`
 * (excludes SQS_*, S3_*, A_SEARCH_ENV, MSSQL_* â€” those are wired elsewhere).
 * Stay-dark sources are omitted until an enable-provider FR adds them here.
 */
const PROVIDER_CREDENTIAL_KEYS = {
  amazon: ['AMAZON_ACCESS_KEY', 'AMAZON_SECRET_KEY', 'AMAZON_PARTNER_TAG'],
  ebay: [
    'EBAY_CLIENT_ID',
    'EBAY_CLIENT_SECRET',
    'EBAY_REFRESH_TOKEN',
    'EBAY_CAMPAIGN_ID',
  ],
  rakuten: [
    'RAKUTEN_APPLICATION_KEY',
    'RAKUTEN_AFFILIATE_ID',
    'RAKUTEN_SITE_ID',
  ],
  cj: ['CJ_API_TOKEN', 'CJ_COMPANY_ID', 'CJ_WEBSITE_ID'],
  awin: ['AWIN_API_TOKEN', 'AWIN_PUBLISHER_ID'],
  impact: [
    'IMPACT_CAMPAIGN_ID',
    'IMPACT_ACCOUNT_SID',
    'IMPACT_AUTH_TOKEN',
  ],
  // FR-167: enable kelkoo (Secrets Manager JSON keys)
  kelkoo: ['KELKOO_API_KEY', 'KELKOO_PUBLISHER_ID'],
  // FR-168: skimlinks enabled -> FR-138 secret wiring
  skimlinks: ['SKIMLINKS_API_KEY', 'SKIMLINKS_PUBLISHER_ID'],
  // FR-169: aliexpress enabled -> FR-138 secret wiring
  aliexpress: ['ALIEXPRESS_API_KEY'],
  // FR-170: enable etsy
  etsy: ['ETSY_API_KEY'],
  // FR-171: bol enabled -> FR-138 secret wiring
  bol: ['BOL_API_KEY'],
};

/** Non-secret public defaults from `.env.example` (plain env, not Secrets Manager). */
const PROVIDER_PLAIN_DEFAULTS = {
  amazon: {
    AMAZON_HOST: 'webservices.amazon.co.uk',
    AMAZON_REGION: 'eu-west-1',
  },
  ebay: {
    EBAY_MARKETPLACE_ID: 'EBAY_GB',
  },
  rakuten: {
    RAKUTEN_ENDPOINT: 'https://api.rakuten.com/',
  },
  cj: {
    CJ_GRAPHQL_URL: 'https://ads.api.cj.com/query',
  },
  // FR-167
  kelkoo: {
    KELKOO_COUNTRY: 'uk',
  },
  // FR-168
  skimlinks: {
    SKIMLINKS_COUNTRY: 'uk',
  },
  // FR-169
  aliexpress: {
    ALIEXPRESS_TRACKING_ID: 'a-search',
  },
  etsy: {
    ETSY_TRACKING_ID: 'a-search',
  bol: {
    BOL_TRACKING_ID: 'a-search',
  },
  },
};

/**
 * @param {string} sourceId
 * @returns {string}
 */
function providerSecretContextKey(sourceId) {
  return `${sourceId}ProviderSecretArn`;
}

/**
 * Synth/deploy placeholder ARN (never a real account). Complete ARN includes
 * the 6-char random suffix required by fromSecretCompleteArn.
 * @param {string} sourceId
 * @returns {string}
 */
function providerSecretArnPlaceholder(sourceId) {
  return `arn:aws:secretsmanager:eu-west-2:000000000000:secret:a-search/provider/${sourceId}-AbCdEf`;
}

/**
 * FR-138: wire provider credential keys from a per-source Secrets Manager JSON
 * onto the worker/onboarding Lambda. One grantRead per function.
 * @param {lambda.Function} fn
 * @param {secretsmanager.ISecret} secret
 * @param {string[]} keys
 */
function wireProviderSecretEnv(fn, secret, keys) {
  if (!keys || !keys.length) {
    throw new Error('wireProviderSecretEnv: keys required');
  }
  for (const key of keys) {
    fn.addEnvironment(key, secret.secretValueFromJson(key).unsafeUnwrap());
  }
  secret.grantRead(fn);
}

/**
 * @param {lambda.Function} fn
 * @param {string} sourceId
 * @param {'live'|'sandbox'} [env]
 */
function applyProviderPlainDefaults(fn, sourceId, env) {
  const defaults = PROVIDER_PLAIN_DEFAULTS[sourceId];
  if (defaults) {
    for (const [k, v] of Object.entries(defaults)) {
      fn.addEnvironment(k, v);
    }
  }
  if (sourceId === 'ebay' && env) {
    fn.addEnvironment('EBAY_ENV', env === 'live' ? 'production' : 'sandbox');
  }
}

/**
 * FR-023/024/035/036/037: entry Lambda (providers-aware asset) + API Gateway POST /search +
 * per-enabled-source live/sandbox queues + SQS-triggered worker Lambdas +
 * maintainer EventBridge schedules + awin onboarding live/sandbox + impact onboarding live/sandbox Lambdas (FR-056a/b/c/d).
 * Queue names match providers/queueName.js: a-search-{source}-{env}.
 *
 * FR-149: explicit no-VPC - Lambdas use default AWS networking (no ec2.Vpc / NAT / SG in this stack).
 * MSSQL reachability is ops fixed-egress allowlist (FR-122 option A) documented in docs/deploy.md.
 * FR-158: same default egress for HTTPS intake (irc.ntsa.uk); measure + fail-soft in docs/intake-on-exception.md.
 */
class ASearchStack extends cdk.Stack {
  /**
   * @param {Construct} scope
   * @param {string} id
   * @param {cdk.StackProps} [props]
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // FR-156: optional -c stage= suffix on physical names (default unchanged).
    const stageSuffix = resolveStageSuffix({
      stage: this.node.tryGetContext('stage'),
    });
    /** @param {string} base */
    const stagedName = (base) => withStageSuffix(base, stageSuffix);

    // FR-155: cost allocation tags on all taggable stack resources.
    // Env from -c stage= / -c env= (default "default"); Project always a-search.
    // Same context key `stage` as FR-156 name suffixes.
    const costTags = resolveCostTags({
      stage: this.node.tryGetContext('stage'),
      env: this.node.tryGetContext('env'),
      costEnv: this.node.tryGetContext('costEnv'),
    });
    cdk.Tags.of(this).add('Project', costTags.Project);
    cdk.Tags.of(this).add('Env', costTags.Env);
    // FR-149 / FR-158: no VPC/NAT/SecurityGroup constructs - default Lambda egress
    // (MSSQL allowlist + HTTPS intake to irc.ntsa.uk).
    const { sources } = loadRegistry();
    const enabledSources = sources.filter(
      (s) =>
        s &&
        s.enabled &&
        (s.enabled.live === true || s.enabled.sandbox === true),
    );

    // FR-148: entry is env-agnostic for accept - do not pin A_SEARCH_ENV.
    // Job env comes from body.sandbox (default live); workers/maintainer stay pinned.
    /** @type {Record<string, string>} */
    const entryEnv = {};

    // FR-129: one dedicated results bucket (FR-124 live/sandbox key prefixes).
    // Auto-named - do not invent production account IDs or hard-code bucket names.
    // FR-130 wires env + IAM below.
    // FR-154: deepen security defaults â€” SSE-S3, BlockPublicAccess ALL,
    // enforceSSL, BucketOwnerEnforced (no public ACL). CMK KMS is OOS.
    const resultsBucket = new s3.Bucket(this, 'ResultsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });


    // FR-137: MSSQL_* from Secrets Manager (ARN via -c mssqlSecretArn=...).
    // JSON keys SERVER/USER/PASSWORD; DATABASE is plain per env (FR-121 sandbox name).
    const mssqlSecretArn =
      this.node.tryGetContext('mssqlSecretArn') || MSSQL_SECRET_ARN_PLACEHOLDER;
    const mssqlSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'MssqlConnSecret',
      mssqlSecretArn,
    );
    const mssqlLiveDatabase =
      this.node.tryGetContext('mssqlLiveDatabase') || MSSQL_LIVE_DATABASE;
    const mssqlSandboxDatabase =
      this.node.tryGetContext('mssqlSandboxDatabase') ||
      MSSQL_SANDBOX_DATABASE_DEFAULT;

    // FR-138: per-enabled-source provider credential secrets (context override
    // -c amazonProviderSecretArn=... etc.). Stay-dark sources never enter
    // enabledSources, so they get no secret constructs or grants.
    /** @type {Record<string, secretsmanager.ISecret>} */
    const providerSecrets = {};
    const resolveProviderSecret = (sourceId) => {
      if (!providerSecrets[sourceId]) {
        const arn =
          this.node.tryGetContext(providerSecretContextKey(sourceId)) ||
          providerSecretArnPlaceholder(sourceId);
        providerSecrets[sourceId] =
          secretsmanager.Secret.fromSecretCompleteArn(
            this,
            `${pascalSource(sourceId)}ProviderSecret`,
            arn,
          );
      }
      return providerSecrets[sourceId];
    };

    // FR-037: staged asset includes entry/src + providers/* (not entry/src alone)
    const repoRoot = path.join(__dirname, '..', '..');
    const entryAssetDir = stageEntryLambdaAsset(repoRoot);
    const entry = new lambda.Function(this, 'EntryFunction', {
      functionName: stagedName('a-search-entry'),
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'entry/src/index.handler',
      code: lambda.Code.fromAsset(entryAssetDir),
      timeout: cdk.Duration.seconds(30),
      memorySize: ENTRY_LAMBDA_MEMORY_MB,
      environment: entryEnv,
      logGroup: lambdaLogGroup(this, 'EntryFunctionLogGroup'),
    });
    wireResultsBucketAccess(entry, resultsBucket);
    // FR-136: JWT_* from Secrets Manager (context jwtSecretArn or created secret)
    const entryJwtSecret = resolveEntryJwtSecret(this, this);
    wireEntryJwtSecrets(entry, entryJwtSecret);
    new cdk.CfnOutput(this, 'EntryJwtSecretArn', {
      value: entryJwtSecret.secretArn,
      description: 'Secrets Manager ARN for entry JWT_* JSON (FR-136)',
    });

    // FR-143: placeholder SNS topic for ops alarms (subscriptions out of scope)
    const opsAlarmTopic = new sns.Topic(this, 'OpsAlarmTopic', {
      topicName: stagedName('a-search-ops-alarms'),
      displayName: 'a-search ops alarms (FR-143 placeholder)',
    });
    new cdk.CfnOutput(this, 'OpsAlarmTopicArn', {
      value: opsAlarmTopic.topicArn,
      description: 'FR-143 placeholder SNS topic for DLQ depth alarms',
    });

    // FR-036: queues + workers for every enabled shortlist source x env
    for (const src of enabledSources) {
      // FR-444: stage provider src + shared/ so ../../../../shared/* resolves in Lambda
      const workerAssetDir = stageProviderWorkerLambdaAsset(repoRoot, src);
      const pascal = pascalSource(src.id);
      const envs = /** @type {Array<'live'|'sandbox'>} */ (
        ['live', 'sandbox'].filter((e) => src.enabled[e] === true)
      );

      for (const env of envs) {
        const qName = stagedName(queueName(src.id, env));
        const envPascal = env === 'live' ? 'Live' : 'Sandbox';
        // FR-142: sibling DLQ + redrive so poison messages leave the worker queue
        // FR-162: SQS-managed SSE on primary + DLQ (no CMK per queue)
        const dlq = new sqs.Queue(this, `${pascal}${envPascal}DeadLetterQueue`, {
          queueName: `${qName}-dlq`,
          retentionPeriod: cdk.Duration.days(14),
          encryption: sqs.QueueEncryption.SQS_MANAGED,
        });
        // FR-164: visibilityTimeout > worker Lambda timeout (6x buffer)
        const queue = new sqs.Queue(this, `${pascal}${envPascal}Queue`, {
          queueName: qName,
          visibilityTimeout: cdk.Duration.seconds(
            WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC,
          ),
          encryption: sqs.QueueEncryption.SQS_MANAGED,
          deadLetterQueue: {
            queue: dlq,
            maxReceiveCount: 3,
          },
        });

        const urlKey = queueUrlEnvKey(src.queueEnv, env);
        entry.addEnvironment(urlKey, queue.queueUrl);
        queue.grantSendMessages(entry);

        const workerMemoryMb = isLocalProviderFolder(src.folder)
          ? WORKER_MSSQL_LAMBDA_MEMORY_MB
          : WORKER_LAMBDA_MEMORY_MB;
        const worker = new lambda.Function(
          this,
          `${pascal}${envPascal}WorkerFunction`,
          {
            functionName: stagedName(`a-search-${src.id}-worker-${env}`),
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: workerHandlerPath(src),
            code: lambda.Code.fromAsset(workerAssetDir),
            timeout: cdk.Duration.seconds(WORKER_LAMBDA_TIMEOUT_SEC),
            memorySize: workerMemoryMb,
            environment: {
              A_SEARCH_ENV: env,
            },
            logGroup: lambdaLogGroup(
              this,
              `${pascal}${envPascal}WorkerLogGroup`,
            ),
          },
        );
        wireResultsBucketAccess(worker, resultsBucket);
        if (isLocalProviderFolder(src.folder)) {
          wireMssqlSecretEnv(worker, mssqlSecret, {
            database:
              env === 'live' ? mssqlLiveDatabase : mssqlSandboxDatabase,
          });
        }
        // FR-138: provider credentials from per-source Secrets Manager JSON
        const providerKeys = PROVIDER_CREDENTIAL_KEYS[src.id];
        if (providerKeys) {
          const providerSecret = resolveProviderSecret(src.id);
          wireProviderSecretEnv(worker, providerSecret, providerKeys);
          applyProviderPlainDefaults(worker, src.id, env);
        }
        const sqsOpts = { batchSize: 1 };
        const maxConcurrency = sqsMaxConcurrencyForSource(src);
        if (maxConcurrency != null) {
          sqsOpts.maxConcurrency = maxConcurrency;
        }
        worker.addEventSource(new SqsEventSource(queue, sqsOpts));

        new cdk.CfnOutput(this, `${pascal}${envPascal}QueueUrl`, {
          value: queue.queueUrl,
        });
        new cdk.CfnOutput(this, `${pascal}${envPascal}DeadLetterQueueUrl`, {
          value: dlq.queueUrl,
          description: `FR-142 DLQ for ${qName}`,
        });
        new cdk.CfnOutput(this, `${pascal}${envPascal}WorkerFunctionName`, {
          value: worker.functionName,
        });

        // FR-143: alarm when DLQ has visible messages (>= 1)
        const dlqAlarm = new cloudwatch.Alarm(
          this,
          `${pascal}${envPascal}DlqDepthAlarm`,
          {
            alarmName: stagedName(`a-search-${src.id}-${env}-dlq-depth`),
            alarmDescription: `FR-143: ${qName}-dlq ApproximateNumberOfMessagesVisible >= 1`,
            metric: dlq.metricApproximateNumberOfMessagesVisible(),
            threshold: 1,
            comparisonOperator:
              cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            evaluationPeriods: 1,
            datapointsToAlarm: 1,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
          },
        );
        dlqAlarm.addAlarmAction(new cw_actions.SnsAction(opsAlarmTopic));
      }
    }

    // FR-035: HTTP API POST /search -> entry (JWT still verified in Lambda)
    // FR-153: CORS allowlist from -c corsOrigins (default localhost-only; never *)
    // FR-156: apiName gets optional stage suffix
    // FR-157: createDefaultStage false so we own $default access logs + throttle
    const corsOrigins = resolveCorsOrigins({
      corsOrigins: this.node.tryGetContext('corsOrigins'),
    });
    /** @type {apigwv2.HttpApiProps} */
    const httpApiProps = {
      apiName: stagedName('a-search'),
      description:
        'a-search POST /search + GET|POST /selftest + /account/performance -> entry Lambda',
      createDefaultStage: false,
    };
    if (corsOrigins.length > 0) {
      httpApiProps.corsPreflight = {
        allowOrigins: corsOrigins,
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Authorization', 'Content-Type', 'Accept'],
        maxAge: cdk.Duration.days(1),
      };
    }
    const httpApi = new apigwv2.HttpApi(this, 'SearchHttpApi', httpApiProps);
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

    // FR-157: access logs + conservative default-route throttle (context-overridable)
    const apiAccessLogGroup = new logs.LogGroup(this, 'HttpApiAccessLogGroup', {
      retention: LOG_RETENTION,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const apiThrottle = resolveApiThrottle({
      apiThrottleRate: this.node.tryGetContext('apiThrottleRate'),
      apiThrottleBurst: this.node.tryGetContext('apiThrottleBurst'),
    });
    new apigwv2.HttpStage(this, 'HttpApiDefaultStage', {
      httpApi,
      stageName: '$default',
      autoDeploy: true,
      accessLogSettings: {
        destination: new apigwv2.LogGroupLogDestination(apiAccessLogGroup),
        format: apigw.AccessLogFormat.clf(),
      },
      throttle: {
        rateLimit: apiThrottle.rateLimit,
        burstLimit: apiThrottle.burstLimit,
      },
    });

    // FR-024: separate maintainer Lambdas so A_SEARCH_ENV is fixed per target
    // FR-131: stage maintainer/src + shared/ so ../../shared/intake/reportException resolves
    const maintainerAssetDir = stageMaintainerLambdaAsset(repoRoot);
    const maintainerCode = lambda.Code.fromAsset(maintainerAssetDir);
    const maintainerLive = new lambda.Function(this, 'MaintainerLiveFunction', {
      functionName: stagedName('a-search-maintainer-live'),
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: maintainerHandlerPath(),
      code: maintainerCode,
      timeout: cdk.Duration.minutes(5),
      memorySize: HEAVY_LAMBDA_MEMORY_MB,
      environment: {
        A_SEARCH_ENV: 'live',
        MAINTAINER_TOP: '10',
      },
      logGroup: lambdaLogGroup(this, 'MaintainerLiveLogGroup'),
    });
    wireResultsBucketAccess(maintainerLive, resultsBucket);
    wireMssqlSecretEnv(maintainerLive, mssqlSecret, {
      database: mssqlLiveDatabase,
    });
    const maintainerSandbox = new lambda.Function(
      this,
      'MaintainerSandboxFunction',
      {
        functionName: stagedName('a-search-maintainer-sandbox'),
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: maintainerHandlerPath(),
        code: maintainerCode,
        timeout: cdk.Duration.minutes(5),
        memorySize: HEAVY_LAMBDA_MEMORY_MB,
        environment: {
          A_SEARCH_ENV: 'sandbox',
          MAINTAINER_TOP: '10',
        },
        logGroup: lambdaLogGroup(this, 'MaintainerSandboxLogGroup'),
      },
    );
    wireResultsBucketAccess(maintainerSandbox, resultsBucket);
    wireMssqlSecretEnv(maintainerSandbox, mssqlSecret, {
      database: mssqlSandboxDatabase,
    });

    // Default proposal: every 15 minutes (MAINTAINER_INTERVAL_MINUTES)
    const schedule = events.Schedule.rate(cdk.Duration.minutes(15));
    new events.Rule(this, 'MaintainerLiveSchedule', {
      ruleName: stagedName('a-search-maintainer-live'),
      description: 'Roll Parts feeds for A_SEARCH_ENV=live',
      schedule,
      targets: [new targets.LambdaFunction(maintainerLive)],
    });
    new events.Rule(this, 'MaintainerSandboxSchedule', {
      ruleName: stagedName('a-search-maintainer-sandbox'),
      description: 'Roll Parts feeds for A_SEARCH_ENV=sandbox',
      schedule,
      targets: [new targets.LambdaFunction(maintainerSandbox)],
    });

    // FR-056a/b: Awin onboarding live + sandbox Lambdas (A_SEARCH_ENV fixed).
    // FR-132: stage onboarding/src + shared/ (handler path under staged root).
    const awinOnboardingFolder = 'providers/local/awin/onboarding';
    const awinOnboardingCode = lambda.Code.fromAsset(
      stageOnboardingLambdaAsset(repoRoot, awinOnboardingFolder),
    );
    const awinOnboardingHandler = onboardingHandlerPath(awinOnboardingFolder);
    const awinOnboardingLive = new lambda.Function(
      this,
      'AwinOnboardingLiveFunction',
      {
        functionName: stagedName('a-search-awin-onboarding-live'),
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: awinOnboardingHandler,
        code: awinOnboardingCode,
        timeout: cdk.Duration.minutes(5),
        memorySize: HEAVY_LAMBDA_MEMORY_MB,
        environment: {
          A_SEARCH_ENV: 'live',
        },
        logGroup: lambdaLogGroup(this, 'AwinOnboardingLiveLogGroup'),
      },
    );
    wireResultsBucketAccess(awinOnboardingLive, resultsBucket);
    wireMssqlSecretEnv(awinOnboardingLive, mssqlSecret, {
      database: mssqlLiveDatabase,
    });
    wireProviderSecretEnv(
      awinOnboardingLive,
      resolveProviderSecret('awin'),
      PROVIDER_CREDENTIAL_KEYS.awin,
    );
    const awinOnboardingSandbox = new lambda.Function(
      this,
      'AwinOnboardingSandboxFunction',
      {
        functionName: stagedName('a-search-awin-onboarding-sandbox'),
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: awinOnboardingHandler,
        code: awinOnboardingCode,
        timeout: cdk.Duration.minutes(5),
        memorySize: HEAVY_LAMBDA_MEMORY_MB,
        environment: {
          A_SEARCH_ENV: 'sandbox',
        },
        logGroup: lambdaLogGroup(this, 'AwinOnboardingSandboxLogGroup'),
      },
    );
    wireResultsBucketAccess(awinOnboardingSandbox, resultsBucket);
    wireMssqlSecretEnv(awinOnboardingSandbox, mssqlSecret, {
      database: mssqlSandboxDatabase,
    });
    wireProviderSecretEnv(
      awinOnboardingSandbox,
      resolveProviderSecret('awin'),
      PROVIDER_CREDENTIAL_KEYS.awin,
    );

    // FR-056d: Impact onboarding sandbox Lambda (A_SEARCH_ENV fixed).
    // FR-132: staged asset includes shared/identity for relative requires.
    const impactOnboardingFolder = 'providers/local/impact/onboarding';
    const impactOnboardingCode = lambda.Code.fromAsset(
      stageOnboardingLambdaAsset(repoRoot, impactOnboardingFolder),
    );
    const impactOnboardingHandler = onboardingHandlerPath(impactOnboardingFolder);
    const impactOnboardingSandbox = new lambda.Function(
      this,
      'ImpactOnboardingSandboxFunction',
      {
        functionName: stagedName('a-search-impact-onboarding-sandbox'),
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: impactOnboardingHandler,
        code: impactOnboardingCode,
        timeout: cdk.Duration.minutes(5),
        memorySize: HEAVY_LAMBDA_MEMORY_MB,
        environment: {
          A_SEARCH_ENV: 'sandbox',
        },
        logGroup: lambdaLogGroup(this, 'ImpactOnboardingSandboxLogGroup'),
      },
    );
    wireResultsBucketAccess(impactOnboardingSandbox, resultsBucket);
    wireMssqlSecretEnv(impactOnboardingSandbox, mssqlSecret, {
      database: mssqlSandboxDatabase,
    });
    wireProviderSecretEnv(
      impactOnboardingSandbox,
      resolveProviderSecret('impact'),
      PROVIDER_CREDENTIAL_KEYS.impact,
    );

    // FR-056c: Impact onboarding live Lambda (A_SEARCH_ENV fixed). Schedules -> FR-056e.
    // FR-132: same staged impact asset as sandbox.
    const impactOnboardingLive = new lambda.Function(
      this,
      'ImpactOnboardingLiveFunction',
      {
        functionName: stagedName('a-search-impact-onboarding-live'),
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: impactOnboardingHandler,
        code: impactOnboardingCode,
        timeout: cdk.Duration.minutes(5),
        memorySize: HEAVY_LAMBDA_MEMORY_MB,
        environment: {
          A_SEARCH_ENV: 'live',
        },
        logGroup: lambdaLogGroup(this, 'ImpactOnboardingLiveLogGroup'),
      },
    );
    wireResultsBucketAccess(impactOnboardingLive, resultsBucket);
    wireMssqlSecretEnv(impactOnboardingLive, mssqlSecret, {
      database: mssqlLiveDatabase,
    });
    wireProviderSecretEnv(
      impactOnboardingLive,
      resolveProviderSecret('impact'),
      PROVIDER_CREDENTIAL_KEYS.impact,
    );

    // FR-056e: daily EventBridge rules for each onboarding Lambda in this stack
    // (clubscan Awin-Onboarding daily intent). Lambda code is out of scope.
    const onboardingSchedule = events.Schedule.rate(cdk.Duration.days(1));
    const awinOnboardingLiveRule = new events.Rule(this, 'AwinOnboardingLiveSchedule', {
      ruleName: stagedName('a-search-awin-onboarding-live'),
      description: 'Daily drain for Awin onboarding A_SEARCH_ENV=live',
      schedule: onboardingSchedule,
      targets: [new targets.LambdaFunction(awinOnboardingLive)],
    });
    const awinOnboardingSandboxRule = new events.Rule(
      this,
      'AwinOnboardingSandboxSchedule',
      {
        ruleName: stagedName('a-search-awin-onboarding-sandbox'),
        description: 'Daily drain for Awin onboarding A_SEARCH_ENV=sandbox',
        schedule: onboardingSchedule,
        targets: [new targets.LambdaFunction(awinOnboardingSandbox)],
      },
    );
    const impactOnboardingSandboxRule = new events.Rule(
      this,
      'ImpactOnboardingSandboxSchedule',
      {
        ruleName: stagedName('a-search-impact-onboarding-sandbox'),
        description: 'Daily drain for Impact onboarding A_SEARCH_ENV=sandbox',
        schedule: onboardingSchedule,
        targets: [new targets.LambdaFunction(impactOnboardingSandbox)],
      },
    );
    // FR-133: Impact onboarding live daily rule (sibling of sandbox; mirrors awin live).
    const impactOnboardingLiveRule = new events.Rule(
      this,
      'ImpactOnboardingLiveSchedule',
      {
        ruleName: stagedName('a-search-impact-onboarding-live'),
        description: 'Daily drain for Impact onboarding A_SEARCH_ENV=live',
        schedule: onboardingSchedule,
        targets: [new targets.LambdaFunction(impactOnboardingLive)],
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
    new cdk.CfnOutput(this, 'MssqlSecretArn', {
      value: mssqlSecret.secretArn,
      description:
        'FR-137 Secrets Manager ARN used for MSSQL_* (override with -c mssqlSecretArn)',
    });
    for (const sourceId of Object.keys(providerSecrets)) {
      new cdk.CfnOutput(this, `${pascalSource(sourceId)}ProviderSecretArn`, {
        value: providerSecrets[sourceId].secretArn,
        description: `FR-138 provider credentials for ${sourceId} (override with -c ${providerSecretContextKey(sourceId)})`,
      });
    }
    new cdk.CfnOutput(this, 'AwinOnboardingLiveRuleName', {
      value: awinOnboardingLiveRule.ruleName,
    });
    new cdk.CfnOutput(this, 'AwinOnboardingSandboxRuleName', {
      value: awinOnboardingSandboxRule.ruleName,
    });
    new cdk.CfnOutput(this, 'ImpactOnboardingSandboxRuleName', {
      value: impactOnboardingSandboxRule.ruleName,
    });
    new cdk.CfnOutput(this, 'ImpactOnboardingLiveRuleName', {
      value: impactOnboardingLiveRule.ruleName,
    });
  }
}

module.exports = {
  ASearchStack,
  queueUrlEnvKey,
  pascalSource,
  wireResultsBucketAccess,
  wireMssqlSecretEnv,
  wireProviderSecretEnv,
  applyProviderPlainDefaults,
  providerSecretContextKey,
  providerSecretArnPlaceholder,
  isLocalProviderFolder,
  PROVIDER_CREDENTIAL_KEYS,
  PROVIDER_PLAIN_DEFAULTS,
  MSSQL_LIVE_DATABASE,
  MSSQL_SANDBOX_DATABASE_DEFAULT,
  MSSQL_SECRET_ARN_PLACEHOLDER,
  WORKER_LAMBDA_TIMEOUT_SEC,
  WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC,
  ENTRY_LAMBDA_MEMORY_MB,
  WORKER_LAMBDA_MEMORY_MB,
  WORKER_MSSQL_LAMBDA_MEMORY_MB,
  HEAVY_LAMBDA_MEMORY_MB,
};
