'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cdk = require('aws-cdk-lib');
const lambda = require('aws-cdk-lib/aws-lambda');
const sqs = require('aws-cdk-lib/aws-sqs');
const s3 = require('aws-cdk-lib/aws-s3');
const iam = require('aws-cdk-lib/aws-iam');
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
const { HttpIamAuthorizer } = require('aws-cdk-lib/aws-apigatewayv2-authorizers');
const apigw = require('aws-cdk-lib/aws-apigateway');
const { Construct } = require('constructs');
const { resolveApiThrottle } = require('./resolve-api-throttle');
const {
  resolveDeployNameSuffix,
  withStageSuffix,
} = require('./resolve-stage-suffix');
const { resolveCorsOrigins } = require('./resolve-cors-origins');
const { resolveCostTags } = require('./resolve-cost-tags');
const {
  BUNDLED_ENV_REQUIRED,
  requiredBundledEnvKeys,
  assertProviderEnvFileKeys,
  softCheckProviderEnvFileKeys,
} = require('./provider-env-assert');
/** FR-143: 30-day CloudWatch Logs retention on every Lambda. */
const LOG_RETENTION = logs.RetentionDays.ONE_MONTH;

/**
 * FR-164: worker Lambda timeout (seconds). Queue visibility must be strictly
 * greater; AWS guidance for SQS->Lambda is at least 6x the function timeout.
 */
const WORKER_LAMBDA_TIMEOUT_SEC = 60;
const WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC = WORKER_LAMBDA_TIMEOUT_SEC * 6;

/**
 * FR-2139 / FR-240: shop-sync FIFO queue (+ DLQ). Visibility sized for a future
 * consumer (6x of a 300s catalogue-sync timeout). Worker Lambda removed in FR-3949.
 */
const SHOP_SYNC_LAMBDA_TIMEOUT_SEC = 300;
const SHOP_SYNC_QUEUE_VISIBILITY_TIMEOUT_SEC = SHOP_SYNC_LAMBDA_TIMEOUT_SEC * 6;
const SHOP_SYNC_FIFO_BASE = 'a-search-shop-sync.fifo';
const SHOP_SYNC_MAX_RECEIVE_COUNT = 5;

/**
 * FR-165: explicit memorySize floors (default 128MB OOMs on cold JWKS/SDK).
 * Entry JWT + fan-out: 256MB. Marketplace workers: 256MB. Onboarding: 512MB.
 * WORKER_MSSQL_LAMBDA_MEMORY_MB kept as a named floor constant (FR-3949 removed
 * local/MSSQL worker Lambdas; walrus consumes the shared db-backed queue).
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
const { loadRegistry, isAwsSearchProvider } = require('../../providers/loadRegistry');
const { queueName, queueDlqName } = require('../../providers/queueName');
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

/**
 * Title-case construct id fragment from source id (amazon ------------------- Amazon).
 * Title-case construct id fragment from source id (amazon -------- Amazon).
 * @param {string} id
 */
function pascalSource(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Registry queueEnv `SQS_AMAZON_URL` ------------------- entry env keys SQS_AMAZON_LIVE_URL /
 * Registry queueEnv `SQS_AMAZON_URL` -------- entry env keys SQS_AMAZON_LIVE_URL /
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

/** Non-secret JSON placeholders so CFN :SecretString:KEY refs resolve (FR #3945). */
const ENTRY_JWT_SECRET_PLACEHOLDERS = {
  JWT_ISSUER: 'https://a-search.example.invalid/',
  JWT_AUDIENCE: 'a-search',
  JWT_JWKS_URL: 'https://a-search.example.invalid/.well-known/jwks.json',
};

/**
 * FR-136 / FR-3945: JWT secret ARN context, or create JSON EntryJwtSecret.
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
  // FR #3945: default Secret() yields GenerateSecretString:{} (plain password).
  // Entry wires JWT_* via secretValueFromJson --- SecretString must be JSON.
  return new secretsmanager.Secret(scope, 'EntryJwtSecret', {
    description:
      'a-search entry JWT_* JSON (FR-136 / FR-3945). Keys: JWT_ISSUER, JWT_AUDIENCE, JWT_JWKS_URL, JWT_SECRET (optional JWT_HS256_SECRET). Placeholder values until ops replace; never real secrets in git.',
    removalPolicy: cdk.RemovalPolicy.RETAIN,
    generateSecretString: {
      secretStringTemplate: JSON.stringify(ENTRY_JWT_SECRET_PLACEHOLDERS),
      generateStringKey: 'JWT_SECRET',
      excludeCharacters: ' %+~#$&*()|[]{}:;<>?!\'/"\\',
    },
  });
}

/**
 * FR-136: wire JWT_* env from Secrets Manager JSON fields + grant read.
 * CloudFormation dynamic refs -------- no secret strings in the synth snapshot.
 * CloudFormation dynamic refs --- no secret strings in the synth snapshot.
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

/**
 * FR #4038 / #4030: live provider workers write a-clubs/{host}/{guid}/IN/*.
 * FR #4917: same grant covers DONE/{searchid}-{source}.json + GUID marker
 * CopyObject REPLACE for hasresults=1 (grantReadWrite + Copy/Tag below).
 * FR #4545 / #4441: touchLastmod -> rewriteMarkerMetadata uses CopyObject +
 * object tagging; grantReadWrite does not include s3:CopyObject (ebay AccessDenied).
 * FR #4559: annotated markers (redqueen PutObjectAnnotation) --- CopyObject /
 * Metadata REPLACE on those keys needs Get/List ObjectAnnotation (same family as
 * parts-gateway / redqueen annotator). Workers do not Put/Delete annotations.
 * @param {lambda.Function} fn
 * @param {s3.IBucket} bucket
 */
function wireAclubsInAccess(fn, bucket) {
  fn.addEnvironment('A_CLUBS_BUCKET', bucket.bucketName);
  bucket.grantReadWrite(fn);
  const objectArn = bucket.arnForObjects
    ? bucket.arnForObjects('*')
    : `arn:aws:s3:::${bucket.bucketName}/*`;
  fn.addToRolePolicy(
    new iam.PolicyStatement({
      sid: 'AclubsInCopyAndTag',
      actions: [
        's3:CopyObject',
        's3:GetObjectTagging',
        's3:PutObjectTagging',
        's3:GetObjectAnnotation',
        's3:ListObjectAnnotations',
      ],
      resources: [objectArn],
    }),
  );
}

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
 * FR-138: credential env keys from each enabled provider `.env.example`
 * (excludes SQS_*, S3_*, A_SEARCH_ENV, MSSQL_* -------- those are wired elsewhere).
 * (excludes SQS_*, S3_*, A_SEARCH_ENV, MSSQL_* --- those are wired elsewhere).
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
    'RAKUTEN_CLIENT_ID',
    'RAKUTEN_CLIENT_SECRET',
    'RAKUTEN_SID',
    'RAKUTEN_SITE_ID',
  ],
  cj: ['CJ_API_TOKEN', 'CJ_COMPANY_ID', 'CJ_WEBSITE_ID'],
  awin: ['AWIN_API_TOKEN', 'AWIN_PUBLISHER_ID'],
  impact: [
    'IMPACT_CAMPAIGN_ID',
    'IMPACT_ACCOUNT_SID',
    'IMPACT_AUTH_TOKEN',
  ],
  // Kelkoo: bundled providers/live/kelkoo/.env (no Secrets Manager / SSM)
  kelkoo: ['KELKOO_API_KEY', 'KELKOO_PUBLISHER_ID'],
  // FR-168: skimlinks enabled -> FR-138 secret wiring
  skimlinks: ['SKIMLINKS_API_KEY', 'SKIMLINKS_PUBLISHER_ID'],
  // FR-169: aliexpress enabled -> FR-138 secret wiring
  aliexpress: ['ALIEXPRESS_API_KEY'],
  // FR-170: enable etsy
  etsy: ['ETSY_API_KEY', 'ETSY_SHARED_SECRET'],
  // FR-171: bol enabled -> FR-138 secret wiring
  bol: ['BOL_API_KEY'],
  // FR-178: enable shopify merchant -> FR-138 secret wiring
  shopify: [
    'SHOPIFY_API_KEY',
    'SHOPIFY_API_SECRET_KEY',
    'SHOPIFY_ACCESS_TOKEN',
    'SHOPIFY_STORE_URL',
  ],
  // FR-180: enable woocommerce merchant
  woocommerce: [
    'WOOCOMMERCE_CONSUMER_KEY',
    'WOOCOMMERCE_CONSUMER_SECRET',
    'WOOCOMMERCE_STORE_URL',
  ],
  // FR-174: enable tradedoubler
  tradedoubler: [
    'TRADEDOUBLER_API_KEY',
    'TRADEDOUBLER_API_TOKEN',
    'TRADEDOUBLER_FEED_TOKEN',
    'TRADEDOUBLER_AFFILIATE_ID',
    'TRADEDOUBLER_PUBLISHER_ID',
  ],
  // FR-177: enable avantlink -> FR-138 secret wiring
  avantlink: [
    'AVANTLINK_API_KEY',
    'AVANTLINK_API_TOKEN',
    'AVANTLINK_FEED_TOKEN',
    'AVANTLINK_PUBLISHER_ID',
    'AVANTLINK_AFFILIATE_ID',
  ],
    // FR-173: enable webgains
  webgains: [
    'WEBGAINS_API_KEY',
    'WEBGAINS_API_TOKEN',
    'WEBGAINS_FEED_TOKEN',
    'WEBGAINS_PUBLISHER_ID',
    'WEBGAINS_CAMPAIGN_ID',
  ],
  // FR-172: enable partnerize
  partnerize: [
    'PARTNERIZE_API_KEY',
    'PARTNERIZE_API_TOKEN',
    'PARTNERIZE_FEED_TOKEN',
    'PARTNERIZE_PUBLISHER_ID',
  ],
  // FR-179: enable wix (merchant app + selftest fallback) -> FR-138
  wix: [
    'WIX_CLIENT_ID',
    'WIX_API_TOKEN',
    'WIX_SITE_ID',
    'WIX_STORE_URL',
  ],
};

/** Non-secret public defaults from `.env.example` (plain env, not Secrets Manager). */
const PROVIDER_PLAIN_DEFAULTS = {
  amazon: {
    AMAZON_HOST: 'webservices.amazon.co.uk',
    AMAZON_REGION: 'eu-west-1',
    // FR #4562: deploy default Creators (PA-API 5 returns HTML 503s).
    AMAZON_SEARCH_API: 'creators',
  },
  ebay: {
    EBAY_MARKETPLACE_ID: 'EBAY_GB',
  },
  rakuten: {
    RAKUTEN_TOKEN_URL: 'https://api.linksynergy.com/token',
    RAKUTEN_ENDPOINT: 'https://api.linksynergy.com/productsearch/1.0',
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
    ETSY_AFFILIATE_NETWORK: 'rakuten',
    // ETSY_RAKUTEN_MID / RAKUTEN_PUBLISHER_ID from secrets; no plain publisher default
  },
  // FR-171
  bol: {
    BOL_TRACKING_ID: 'a-search',
  },
  // FR-179 merchant API base default
  wix: {
    WIX_API_BASE: 'https://www.wixapis.com',
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
 * FR #4352: only a real Secrets Manager ARN may be wired. Empty context and the
 * 000000000000 placeholder must not become a Lambda dynamic reference.
 * @param {string} arn
 * @returns {string}
 */
function deployableProviderSecretArn(arn) {
  const s = String(arn || '').trim();
  if (!s || s.includes('000000000000')) return '';
  if (!s.startsWith('arn:aws:secretsmanager:')) return '';
  return s;
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
function applyProviderPlainDefaults(fn, sourceId, env, skipKeys) {
  const defaults = PROVIDER_PLAIN_DEFAULTS[sourceId];
  const skip = skipKeys || new Set();
  if (defaults) {
    for (const [k, v] of Object.entries(defaults)) {
      if (skip.has(k)) continue;
      fn.addEnvironment(k, v);
    }
  }
  if (sourceId === 'ebay' && env && !skip.has('EBAY_ENV')) {
    fn.addEnvironment('EBAY_ENV', env === 'live' ? 'production' : 'sandbox');
  }
}

/**
 * FR #4336: amazon and ebay credentials are read from a gitignored env file
 * at synth time. FR #4439: etsy uses the same path so a live worker is not
 * deployed with ETSY_API_KEY unset (that threw etsy_missing_credentials).
 * Other providers stay on Secrets Manager (FR-138).
 * EBAY_ENV is not copied from the file; the stack env sets it.
 */
const PROVIDER_ENV_FILE = {
  amazon: {
    required: [
      'AMAZON_ACCESS_KEY',
      'AMAZON_SECRET_KEY',
      'AMAZON_PARTNER_TAG',
      'AMAZON_HOST',
      'AMAZON_REGION',
    ],
    optional: ['AMAZON_CREATORS_CREDENTIAL'],
  },
  ebay: {
    required: [
      'EBAY_CLIENT_ID',
      'EBAY_CLIENT_SECRET',
      'EBAY_CAMPAIGN_ID',
      'EBAY_MARKETPLACE_ID',
    ],
    optional: ['EBAY_REFRESH_TOKEN'],
  },
  etsy: {
    required: ['ETSY_API_KEY'],
    optional: ['ETSY_SHARED_SECRET'],
  },
};

function parseDotEnv(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      throw new Error('provider env: invalid line');
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function providerEnvFilePath(repoRoot, sourceId, envRoot) {
  if (envRoot) return path.join(envRoot, `${sourceId}.env`);
  return path.join(repoRoot, 'providers', 'live', sourceId, '.env');
}

/**
 * Read one provider env file. Errors name the missing key and path, never a value.
 * @param {string} repoRoot
 * @param {string} sourceId
 * @param {string} [envRoot] test fixture directory (files named `{id}.env`)
 * @returns {Record<string, string>}
 */
function readProviderEnvFile(repoRoot, sourceId, envRoot) {
  const spec = PROVIDER_ENV_FILE[sourceId];
  if (!spec) {
    throw new Error(`provider env: ${sourceId} is not an env-file provider`);
  }
  const filePath = providerEnvFilePath(repoRoot, sourceId, envRoot);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `provider env ${sourceId}: missing file ${filePath}. Fill providers/live/${sourceId}/.env from .env.example. Required: ${spec.required.join(', ')}`,
    );
  }
  let parsed;
  try {
    parsed = parseDotEnv(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`provider env ${sourceId}: invalid line in ${filePath}`);
  }
  const missing = spec.required.filter((key) => !String(parsed[key] || '').trim());
  if (missing.length) {
    throw new Error(
      `provider env ${sourceId}: missing required ${missing.join(', ')} in ${filePath}`,
    );
  }
  const values = {};
  for (const key of spec.required) values[key] = String(parsed[key]).trim();
  for (const key of spec.optional) {
    const value = parsed[key] != null ? String(parsed[key]).trim() : '';
    if (value) values[key] = value;
  }
  return values;
}

function wireProviderEnvFromFile(fn, sourceId, envRoot, repoRoot) {
  const values = readProviderEnvFile(repoRoot, sourceId, envRoot);
  const setKeys = new Set();
  for (const [key, value] of Object.entries(values)) {
    fn.addEnvironment(key, value);
    setKeys.add(key);
  }
  return setKeys;
}

/**
 * FR #4560: default IgnoreMode.GIT strips repo-root `.gitignore` `.env` from
 * staged worker assets. DOCKER mode has no .dockerignore in the asset tree, so
 * the copied provider `.env` stays in the Lambda zip.
 * @returns {{ ignoreMode: cdk.IgnoreMode }}
 */
function workerLambdaCodeAssetOptions() {
  return { ignoreMode: cdk.IgnoreMode.DOCKER };
}

/**
 * FR-023/024/035/036/037: entry Lambda (providers-aware asset) + API Gateway POST /search +
 * per-enabled-source live/sandbox queues + SQS-triggered worker Lambdas +
 * maintainer EventBridge schedules + awin onboarding live/sandbox + impact onboarding live/sandbox Lambdas (FR-056a/b/c/d).
 * Queue names match providers/queueName.js: a-search-provider-{source}-{env}.fifo (FR #4039).
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

    // FR-156 / FR-191: optional -c stage= and optional region token on physical names.
    const nameSuffix = resolveDeployNameSuffix({
      stage: this.node.tryGetContext('stage'),
      region: this.node.tryGetContext('region'),
      deployRegion: this.node.tryGetContext('deployRegion'),
      includeRegionInNames: this.node.tryGetContext('includeRegionInNames'),
      regionSuffix: this.node.tryGetContext('regionSuffix'),
    });
    /** @param {string} base */
    const stagedName = (base) => withStageSuffix(base, nameSuffix);
    /** @param {string} fifoBase e.g. a-search-provider-ebay-live.fifo */
    const stagedFifoName = (fifoBase) => {
      const raw = String(fifoBase || '');
      if (!raw.endsWith('.fifo')) return stagedName(raw);
      return `${stagedName(raw.slice(0, -'.fifo'.length))}.fifo`;
    };

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
    // FR-208: signup URL + DNS negative TTL via CDK context (never secrets in git).
    const signupUrlCtx = this.node.tryGetContext('signupUrl');
    if (typeof signupUrlCtx === 'string' && signupUrlCtx.trim()) {
      entryEnv.A_SEARCH_SIGNUP_URL = signupUrlCtx.trim();
    }
    const negTtlCtx = this.node.tryGetContext('extStatusNegTtlS');
    if (negTtlCtx != null && String(negTtlCtx).trim() !== '') {
      entryEnv.EXT_STATUS_NEG_TTL_S = String(negTtlCtx).trim();
    }

    // FR-129: one dedicated results bucket (FR-124 live/sandbox key prefixes).
    // Auto-named - do not invent production account IDs or hard-code bucket names.
    // FR-192 LOCKED: region-local ResultsBucket per stack (no S3 CRR). Standby region
    // gets its own bucket via FR-191 second stack; SQL/rclone stay primary/IONOS.
    // FR-130 wires env + IAM below.
    // FR-154: deepen security defaults -------- SSE-S3, BlockPublicAccess ALL,
    // FR-154: deepen security defaults --- SSE-S3, BlockPublicAccess ALL,
    // enforceSSL, BucketOwnerEnforced (no public ACL). CMK KMS is OOS.
    const resultsBucket = new s3.Bucket(this, 'ResultsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      // #1343 / FR-258: S3 -> EventBridge for widget-agent trigger suffixes
      eventBridgeEnabled: true,
    });


    // FR-3949: MSSQL secret / wireMssqlSecretEnv removed. DB-backed merchant and
    // affiliate search work uses one shared SQS queue; walrus (off-AWS) consumes it.

    // FR-138 / FR #4352: wire a provider secret only when -c <id>ProviderSecretArn
    // is a real ARN. No context means no secret construct, no grant, and no
    // placeholder account in the Lambda environment.
    /** @type {Record<string, secretsmanager.ISecret|null>} */
    const providerSecrets = {};
    const resolveProviderSecret = (sourceId) => {
      if (Object.prototype.hasOwnProperty.call(providerSecrets, sourceId)) {
        return providerSecrets[sourceId];
      }
      const arn = deployableProviderSecretArn(
        this.node.tryGetContext(providerSecretContextKey(sourceId)),
      );
      if (!arn) {
        providerSecrets[sourceId] = null;
        return null;
      }
      providerSecrets[sourceId] = secretsmanager.Secret.fromSecretCompleteArn(
        this,
        `${pascalSource(sourceId)}ProviderSecret`,
        arn,
      );
      return providerSecrets[sourceId];
    };

    // FR-037: staged asset includes entry/src + providers/* (not entry/src alone)
    const repoRoot = path.join(__dirname, '..', '..');
    const entryAssetDir = stageEntryLambdaAsset(repoRoot);
    const entry = new lambda.Function(this, 'EntryFunction', {
      functionName: stagedName('a-search-entry'),
      runtime: lambda.Runtime.NODEJS_24_X,
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

    // FR #4030 / #4038: shared a-clubs bucket ref (entry HeadObject + worker IN/ writes).
    const aClubsBucket = s3.Bucket.fromBucketName(
      this,
      'AClubsBucketRef',
      'a-clubs',
    );

    // FR-036 / FR-3949: marketplace (non-local) queues + workers only.
    // Local/DB-backed providers skip per-source queue/DLQ/worker/alarms/entry URL;
    // they share the single a-search-db-backed queue created below.
    /** @type {Array<{ id: string, missingKeys: string[] }>} */
    const credentialDisabled = [];
    /** @type {string[]} FR #5122: annotator/agents GetQueueAttributes targets */
    const opsReadSqsArns = [];
    for (const src of enabledSources) {
      // FR #4451: per-source AWS queues/Lambdas only for awsSearch providers.
      // Local/SQL sources (including skimlinks) share the db-backed queue.
      if (isLocalProviderFolder(src.folder) || src.kind === 'local' || !isAwsSearchProvider(src)) {
        continue;
      }
      // FR #4480 / #4560 / #4650: prefer a .env with required key names (never
      // print values). Missing credentials: keep Lambda/queue/DLQ (no delete),
      // omit the bundle, and do not fan out from /search (provider off).
      const providerEnvRoot = this.node.tryGetContext('providerEnvRoot') || '';
      const envFile = providerEnvFilePath(
        repoRoot,
        src.id,
        providerEnvRoot || undefined,
      );
      const envCheck = softCheckProviderEnvFileKeys(envFile, src.id);
      const envReady = envCheck.ok === true;
      if (!envReady) {
        // FR #5058: keep file path + softCheck message for the synth warning.
        credentialDisabled.push({
          id: src.id,
          missingKeys: envCheck.missingKeys || [],
          filePath: envFile,
          message: envCheck.message || '',
        });
      }
      // FR-444: stage provider src + shared/ so ../../../../shared/* resolves in Lambda
      const workerAssetDir = stageProviderWorkerLambdaAsset(repoRoot, src, {
        envFile: envReady ? envFile : undefined,
      });
      const pascal = pascalSource(src.id);
      const envs = /** @type {Array<'live'|'sandbox'>} */ (
        ['live', 'sandbox'].filter((e) => src.enabled[e] === true)
      );

      for (const env of envs) {
        // FR #4039: FIFO a-search-provider-{name}-{env}.fifo (+ DLQ .fifo).
        // Keeps MessageGroupId=<provider> on send; reservedConcurrency 1 remains.
        const qName = stagedFifoName(queueName(src.id, env));
        const dlqName = stagedFifoName(queueDlqName(src.id, env));
        const envPascal = env === 'live' ? 'Live' : 'Sandbox';
        // FR-142: sibling DLQ + redrive so poison messages leave the worker queue
        // FR-162: SQS-managed SSE on primary + DLQ (no CMK per queue)
        const dlq = new sqs.Queue(this, `${pascal}${envPascal}DeadLetterQueue`, {
          queueName: dlqName,
          fifo: true,
          contentBasedDeduplication: false,
          retentionPeriod: cdk.Duration.days(14),
          encryption: sqs.QueueEncryption.SQS_MANAGED,
        });
        // FR-164: visibilityTimeout > worker Lambda timeout (6x buffer)
        const queue = new sqs.Queue(this, `${pascal}${envPascal}Queue`, {
          queueName: qName,
          fifo: true,
          contentBasedDeduplication: false,
          visibilityTimeout: cdk.Duration.seconds(
            WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC,
          ),
          encryption: sqs.QueueEncryption.SQS_MANAGED,
          deadLetterQueue: {
            queue: dlq,
            maxReceiveCount: 3,
          },
        });
        opsReadSqsArns.push(queue.queueArn, dlq.queueArn);

        // FR #4650: missing credentials => provider off for fan-out (resources kept).
        if (envReady) {
          const urlKey = queueUrlEnvKey(src.queueEnv, env);
          entry.addEnvironment(urlKey, queue.queueUrl);
          queue.grantSendMessages(entry);
        }

        // FR #4030 / FR #4357: reserved concurrency 1 is one job at a time.
        // ESM MaximumConcurrency cannot be below 2, so it is not set here.
        const worker = new lambda.Function(
          this,
          `${pascal}${envPascal}WorkerFunction`,
          {
            functionName: stagedName(`a-search-${src.id}-worker-${env}`),
            runtime: lambda.Runtime.NODEJS_24_X,
            handler: workerHandlerPath(src),
            // FR #4560: IgnoreMode.DOCKER so staged `.env` is not stripped by .gitignore
            code: lambda.Code.fromAsset(
              workerAssetDir,
              workerLambdaCodeAssetOptions(),
            ),
            timeout: cdk.Duration.seconds(WORKER_LAMBDA_TIMEOUT_SEC),
            memorySize: WORKER_LAMBDA_MEMORY_MB,
            reservedConcurrentExecutions: 1,
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
        // FR #4038: workers write a-clubs IN/ (shared schema); need Put/Get + bucket env.
        wireAclubsInAccess(worker, aClubsBucket);
        // FR #4480: credentials ride in the bundled .env, not Secrets Manager.
        // Amazon, eBay, and Etsy still copy non-secret public keys plus the
        // fixture/file values used by existing synth pins (FR #4336).
        const providerKeys = PROVIDER_CREDENTIAL_KEYS[src.id];
        if (providerKeys && PROVIDER_ENV_FILE[src.id] && envReady) {
          const setKeys = wireProviderEnvFromFile(
            worker,
            src.id,
            this.node.tryGetContext('providerEnvRoot') || '',
            repoRoot,
          );
          applyProviderPlainDefaults(worker, src.id, env, setKeys);
        } else if (providerKeys) {
          applyProviderPlainDefaults(worker, src.id, env);
        }
        const sqsOpts = { batchSize: 1 };
        const reservedConcurrency = 1;
        const maxConcurrency = sqsMaxConcurrencyForSource(src);
        // FR #4357: Lambda rejects MaximumConcurrency above ReservedConcurrentExecutions.
        // The helper's floor is 2, which is above reserved concurrency 1, so omit it.
        // Awin and impact use the same helper; workers that are not deployed have no mapping.
        if (maxConcurrency != null && maxConcurrency <= reservedConcurrency) {
          sqsOpts.maxConcurrency = maxConcurrency;
        }
        worker.addEventSource(new SqsEventSource(queue, sqsOpts));
        // FR #4782: nonRetryable faults SendMessage to DLQ + DeleteMessage (first fail).
        worker.addEnvironment('SQS_QUEUE_URL', queue.queueUrl);
        worker.addEnvironment('SQS_DLQ_URL', dlq.queueUrl);
        dlq.grantSendMessages(worker);

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
    if (credentialDisabled.length) {
      // FR #5058: name missing file and keys (never values).
      const parts = credentialDisabled.map((row) => {
        if (row.message) return `${row.id}: ${row.message}`;
        const keys = (row.missingKeys || []).join(', ');
        const fileBit = row.filePath ? ` file ${row.filePath}` : '';
        return `${row.id}: missing ${keys}${fileBit}`;
      });
      // eslint-disable-next-line no-console
      console.warn(
        `[a-search] providers disabled (missing credentials): ${parts.join('; ')}`,
      );
    }

    // FR-3949: one standard SQS + DLQ for all DB-backed merchant/affiliate search.
    // FR-142 redrive (maxReceiveCount 3); FR-162 SQS_MANAGED; visibility like workers.
    const dbBackedDlq = new sqs.Queue(this, 'DbBackedDeadLetterQueue', {
      queueName: stagedName('a-search-db-backed-dlq'),
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });
    const dbBackedQueue = new sqs.Queue(this, 'DbBackedQueue', {
      queueName: stagedName('a-search-db-backed'),
      visibilityTimeout: cdk.Duration.seconds(
        WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC,
      ),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: dbBackedDlq,
        maxReceiveCount: 3,
      },
    });
    entry.addEnvironment('SQS_DB_BACKED_URL', dbBackedQueue.queueUrl);
    // FR #4030: alias for agent fan-out SQL target (same queue; redqueen drains).
    entry.addEnvironment('SQS_SQL_URL', dbBackedQueue.queueUrl);
    dbBackedQueue.grantSendMessages(entry);
    opsReadSqsArns.push(dbBackedQueue.queueArn, dbBackedDlq.queueArn);

    // FR #4311: generate the agent API key in Secrets Manager (RETAIN).
    // FR #5086: /search no longer requires the key (API Gateway IAM only).
    // Keep the secret + entry env for one-release compatibility / external copies;
    // never a -c agentApiKey context string.
    const agentApiKeySecret = new secretsmanager.Secret(this, 'AgentApiKeySecret', {
      description:
        'a-search legacy agent key (FR #4311). Unused by /search after FR #5086 (IAM). RETAIN; never print the value.',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 32,
      },
    });
    entry.addEnvironment(
      'A_SEARCH_AGENT_API_KEY',
      agentApiKeySecret.secretValue.unsafeUnwrap(),
    );
    agentApiKeySecret.grantRead(entry);
    new cdk.CfnOutput(this, 'AgentApiKeySecretArn', {
      value: agentApiKeySecret.secretArn,
      description:
        'FR #4311 agent API key secret ARN (legacy after FR #5086). The key value is not an output.',
    });
    entry.addEnvironment('A_CLUBS_BUCKET', 'a-clubs');
    aClubsBucket.grantRead(entry);
    // FR #5079: /search fan-out reads a-affiliates/<provider>/ enabled=0|1 metadata.
    entry.addEnvironment('A_AFFILIATES_BUCKET', 'a-affiliates');
    entry.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'AgentSearchAffiliatesEnabled',
        actions: ['s3:GetObject'],
        resources: ['arn:aws:s3:::a-affiliates/*'],
      }),
    );
    // FR #5095: HeadObject on a missing key is 403 without ListBucket.
    entry.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'AgentSearchAffiliatesList',
        actions: ['s3:ListBucket'],
        resources: ['arn:aws:s3:::a-affiliates'],
      }),
    );
    // FR #4265: remember one searchid per GUID so a retry does not fan out twice.
    // FR #4712 / #4563: syncSearchesSearchid also PutObjects host/guid/searches.json;
    // grantRead alone is Get*; without PutObject on searches.json entry AccessDenied.
    entry.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'AgentSearchFanoutMarker',
        actions: ['s3:GetObject', 's3:PutObject'],
        resources: [
          'arn:aws:s3:::a-clubs/*/*/search-fanout.json',
          'arn:aws:s3:::a-clubs/*/*/searches.json',
        ],
      }),
    );

    new cdk.CfnOutput(this, 'DbBackedQueueUrl', {
      value: dbBackedQueue.queueUrl,
      description:
        'FR-3949/FR-4030 shared SQL SQS (agent fan-out + redqueen drain)',
    });
    new cdk.CfnOutput(this, 'DbBackedDeadLetterQueueUrl', {
      value: dbBackedDlq.queueUrl,
      description: 'FR-3949 DLQ for a-search-db-backed (maxReceiveCount 3)',
    });

    // FR-3949 / walrus: least-privilege IAM user (no access keys in template).
    // FR #4030: SQL drain moves to redqueen; walrus user retained for transition.
    // SQS consume on db-backed queue+DLQ; S3 live/ + sandbox/ on ResultsBucket.
    const walrusConsumerUser = new iam.User(this, 'WalrusConsumerUser', {
      userName: stagedName('a-search-walrus-consumer'),
    });
    walrusConsumerUser.addToPolicy(
      new iam.PolicyStatement({
        sid: 'WalrusDbBackedSqs',
        actions: [
          'sqs:ReceiveMessage',
          'sqs:DeleteMessage',
          'sqs:ChangeMessageVisibility',
          'sqs:GetQueueAttributes',
        ],
        resources: [dbBackedQueue.queueArn, dbBackedDlq.queueArn],
      }),
    );

    // FR #4030: redqueen SQL-search drain principal (long-poll SQL queue + a-clubs IN/).
    const redqueenSqlUser = new iam.User(this, 'RedqueenSqlDrainUser', {
      userName: stagedName('a-search-redqueen-sql-drain'),
    });
    redqueenSqlUser.addToPolicy(
      new iam.PolicyStatement({
        sid: 'RedqueenSqlSqs',
        actions: [
          'sqs:ReceiveMessage',
          'sqs:DeleteMessage',
          'sqs:ChangeMessageVisibility',
          'sqs:GetQueueAttributes',
        ],
        resources: [dbBackedQueue.queueArn, dbBackedDlq.queueArn],
      }),
    );
    redqueenSqlUser.addToPolicy(
      new iam.PolicyStatement({
        sid: 'RedqueenAclubsInWrite',
        actions: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
        resources: [
          'arn:aws:s3:::a-clubs',
          'arn:aws:s3:::a-clubs/*',
        ],
      }),
    );
    new cdk.CfnOutput(this, 'RedqueenSqlDrainUserName', {
      value: redqueenSqlUser.userName,
      description: 'FR #4030 redqueen SQL drain IAM user (mint keys out-of-band)',
    });
    walrusConsumerUser.addToPolicy(
      new iam.PolicyStatement({
        sid: 'WalrusResultsList',
        actions: ['s3:ListBucket'],
        resources: [resultsBucket.bucketArn],
        conditions: {
          StringLike: {
            's3:prefix': ['live/*', 'sandbox/*'],
          },
        },
      }),
    );
    walrusConsumerUser.addToPolicy(
      new iam.PolicyStatement({
        sid: 'WalrusResultsObjects',
        actions: ['s3:GetObject', 's3:PutObject'],
        resources: [
          resultsBucket.arnForObjects('live/*'),
          resultsBucket.arnForObjects('sandbox/*'),
        ],
      }),
    );
    new cdk.CfnOutput(this, 'WalrusConsumerUserName', {
      value: walrusConsumerUser.userName,
      description: 'FR-3949 walrus IAM user name (mint access keys out-of-band)',
    });
    new cdk.CfnOutput(this, 'WalrusConsumerUserArn', {
      value: walrusConsumerUser.userArn,
      description: 'FR-3949 walrus IAM user ARN',
    });

    // FR-035 / FR #4888: HTTP API POST /search -> entry (IAM authorizer; Lambda accepts IAM identity)
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
        'a-search POST /search + ComponentsPiece /go /ext/status /widgets (FR-219/220 mint) /w/events + FR-216/235 merchant shops + FR-218 /partner/register + FR-222 account payouts + FR-249 /club/revenue-share + FR-229 /auth/session|/auth/redirect + FR-231 /auth/oauth/callback + FR-228 auth email/SMS OTP + account routes -> entry Lambda (GET /parts lives on APartsGateway only; FR #4891)',
      createDefaultStage: false,
    };
    if (corsOrigins.length > 0) {
      httpApiProps.corsPreflight = {
        allowOrigins: corsOrigins,
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: [
          'Authorization',
          'Content-Type',
          'Accept',
          'X-Amz-Date',
          'X-Amz-Security-Token',
        ],
        maxAge: cdk.Duration.days(1),
      };
    }
    const httpApi = new apigwv2.HttpApi(this, 'SearchHttpApi', httpApiProps);
    const searchIamAuthorizer = new HttpIamAuthorizer();
    httpApi.addRoutes({
      path: '/search',
      methods: [apigwv2.HttpMethod.POST],
      authorizer: searchIamAuthorizer,
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
    // FR-059b/l / FR #4888: /selftest IAM authorizer (probes OOS here)
    httpApi.addRoutes({
      path: '/selftest',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      authorizer: searchIamAuthorizer,
      integration: new integrations.HttpLambdaIntegration(
        'EntrySelftestIntegration',
        entry,
      ),
    });
    // FR #4888: same annotator IAM user as a-annotator / sqlQuery (APartsGateway)
    const redqueenAnnotator = iam.User.fromUserName(
      this,
      'ImportedRedqueenAnnotator',
      'a-search-redqueen-annotator',
    );
    redqueenAnnotator.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:Invoke'],
        resources: [
          httpApi.arnForExecuteApi('POST', '/search'),
          httpApi.arnForExecuteApi('GET', '/selftest'),
          httpApi.arnForExecuteApi('POST', '/selftest'),
        ],
      }),
    );
    // FR #5096: annotator must resolve SearchApiUrl via describe-stacks when
    // folder-tools.config.json is absent (no extra shared secret / URL env).
    redqueenAnnotator.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: [
          `arn:aws:cloudformation:${this.region}:${this.account}:stack/${this.stackName}/*`,
        ],
      }),
    );
    // FR #5122: overnight verification needs DLQ depth without redrive/purge.
    const redqueenAgents = iam.User.fromUserName(
      this,
      'ImportedRedqueenAgents',
      'a-search-redqueen-agents',
    );
    const grantOpsSqsRead = (principal) => {
      if (opsReadSqsArns.length) {
        principal.addToPrincipalPolicy(
          new iam.PolicyStatement({
            sid: 'OpsReadProviderDlq',
            actions: ['sqs:GetQueueAttributes'],
            resources: opsReadSqsArns,
          }),
        );
      }
      principal.addToPrincipalPolicy(
        new iam.PolicyStatement({
          sid: 'OpsListQueues',
          actions: ['sqs:ListQueues'],
          resources: ['*'],
        }),
      );
    };
    grantOpsSqsRead(redqueenAnnotator);
    grantOpsSqsRead(redqueenAgents);

    // FR #4891: GET /parts removed from ASearchStack --- canonical route is
    // APartsGateway only (PartsGatewayApiUrl). Do not re-add path: '/parts' here.
    // FR-199 + FR-200: public GET /go (approved path + DNS TXT signup gate; JWT not required)
    httpApi.addRoutes({
      path: '/go',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'EntryGoIntegration',
        entry,
      ),
    });
    // FR-200: public GET /ext/status?host (Club TXT gate for extension; JWT not required)
    httpApi.addRoutes({
      path: '/ext/status',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'EntryExtStatusIntegration',
        entry,
      ),
    });

    // FR-208: ComponentsPiece + extension account routes (handlers owned by sibling FRs;
    // entry stubs return 501 until those land). Public routes share FR-157 stage throttle.
    const entryIntegration = (id) =>
      new integrations.HttpLambdaIntegration(id, entry);

    // FR-232: anonymous POST /widgets (public, throttled)
    httpApi.addRoutes({
      path: '/widgets',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryWidgetsCreateIntegration'),
    });
    // FR-232 / #1344: JWT PATCH /widgets/{widgetGuid}
    httpApi.addRoutes({
      path: '/widgets/{widgetGuid}',
      methods: [apigwv2.HttpMethod.PATCH],
      integration: entryIntegration('EntryWidgetsPatchIntegration'),
    });
    // #1344: JWT POST /widgets/{widgetGuid}/feedback
    httpApi.addRoutes({
      path: '/widgets/{widgetGuid}/feedback',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryWidgetsFeedbackIntegration'),
    });
    // FR-234: JWT GET /widgets/stats and /widgets/{widgetGuid}/stats
    httpApi.addRoutes({
      path: '/widgets/stats',
      methods: [apigwv2.HttpMethod.GET],
      integration: entryIntegration('EntryWidgetsStatsIntegration'),
    });
    httpApi.addRoutes({
      path: '/widgets/{widgetGuid}/stats',
      methods: [apigwv2.HttpMethod.GET],
      integration: entryIntegration('EntryWidgetStatsIntegration'),
    });
    // FR-234: public POST /w/events (beacon; throttled; JWT not required)
    httpApi.addRoutes({
      path: '/w/events',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryWidgetEventsIntegration'),
    });
    // #1344: JWT account commission / Stripe / payouts / upgrade
    httpApi.addRoutes({
      path: '/account/commission',
      methods: [apigwv2.HttpMethod.GET],
      integration: entryIntegration('EntryAccountCommissionIntegration'),
    });
    // FR-249: club revenue-share statement (JWT club role)
    httpApi.addRoutes({
      path: '/club/revenue-share',
      methods: [apigwv2.HttpMethod.GET],
      integration: entryIntegration('EntryClubRevenueShareIntegration'),
    });
    httpApi.addRoutes({
      path: '/account/stripe/link',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryAccountStripeLinkIntegration'),
    });
    httpApi.addRoutes({
      path: '/account/payouts',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryAccountPayoutsIntegration'),
    });
    httpApi.addRoutes({
      path: '/account/upgrade',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryAccountUpgradeIntegration'),
    });
    // #1345: Stripe webhook for upgrade status (signature verified in handler FR)
    httpApi.addRoutes({
      path: '/webhooks/stripe',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryStripeWebhookIntegration'),
    });
    // FR-218: partner registration (mint DNS partner code + instructions)
    httpApi.addRoutes({
      path: '/partner/register',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'EntryPartnerRegisterIntegration',
        entry,
      ),
    });
    // FR-216: merchant shop connect (JWT) + provider callback (state nonce)
    httpApi.addRoutes({
      path: '/merchant/shops/connect',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'EntryMerchantShopsConnectIntegration',
        entry,
      ),
    });
    httpApi.addRoutes({
      path: '/merchant/shops/callback/{provider}',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'EntryMerchantShopsCallbackIntegration',
        entry,
      ),
    });
    // FR-243: Magento Integration identity link
    httpApi.addRoutes({
      path: '/merchant/shops/magento/identity',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'EntryMerchantShopsMagentoIdentityIntegration',
        entry,
      ),
    });
    // FR-235 / #1349: list + delete own shops
    httpApi.addRoutes({
      path: '/merchant/shops',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'EntryMerchantShopsListIntegration',
        entry,
      ),
    });
    httpApi.addRoutes({
      path: '/merchant/shops/{shopId}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration(
        'EntryMerchantShopsDeleteIntegration',
        entry,
      ),
    });
    // FR-239: per-shop subscribe (Checkout) + cancel_at_period_end
    httpApi.addRoutes({
      path: '/merchant/shops/{shopId}/subscribe',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'EntryMerchantShopsSubscribeIntegration',
        entry,
      ),
    });
    httpApi.addRoutes({
      path: '/merchant/shops/{shopId}/cancel',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'EntryMerchantShopsCancelIntegration',
        entry,
      ),
    });
    // FR-236: Shopify webhooks
    httpApi.addRoutes({
      path: '/webhooks/shop/shopify',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryShopifyShopWebhookIntegration'),
    });
    // FR-237: Wix App Removed webhooks
    httpApi.addRoutes({
      path: '/webhooks/shop/wix',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryWixShopWebhookIntegration'),
    });
    // FR-246: Ecwid application.uninstalled webhook
    httpApi.addRoutes({
      path: '/webhooks/shop/ecwid',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryEcwidShopWebhookIntegration'),
    });
    // FR-245: BigCommerce Load + Uninstall (signed_payload_jwt)
    httpApi.addRoutes({
      path: '/webhooks/shop/bigcommerce',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryBigCommerceShopWebhookIntegration'),
    });
    httpApi.addRoutes({
      path: '/webhooks/shop/bigcommerce/uninstall',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration(
        'EntryBigCommerceShopUninstallWebhookIntegration',
      ),
    });
    httpApi.addRoutes({
      path: '/webhooks/shop/bigcommerce/load',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration(
        'EntryBigCommerceShopLoadWebhookIntegration',
      ),
    });
    // FR-229: shared login session mint + post-login redirect (public; JWT not required)
    httpApi.addRoutes({
      path: '/auth/session',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryAuthSessionIntegration'),
    });
    httpApi.addRoutes({
      path: '/auth/redirect',
      methods: [apigwv2.HttpMethod.GET],
      integration: entryIntegration('EntryAuthRedirectIntegration'),
    });
    // FR-231: OAuth callback fail-closed without email|phone|contact (AL3)
    httpApi.addRoutes({
      path: '/auth/oauth/callback',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryAuthOAuthCallbackIntegration'),
    });
    // FR-228: email magic/OTP + merchant SMS OTP (public; rate-limited in handler)
    httpApi.addRoutes({
      path: '/auth/email/request',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryAuthEmailRequestIntegration'),
    });
    httpApi.addRoutes({
      path: '/auth/email/verify',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryAuthEmailVerifyIntegration'),
    });
    httpApi.addRoutes({
      path: '/auth/sms/request',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryAuthSmsRequestIntegration'),
    });
    httpApi.addRoutes({
      path: '/auth/sms/verify',
      methods: [apigwv2.HttpMethod.POST],
      integration: entryIntegration('EntryAuthSmsVerifyIntegration'),
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

    // FR-3949: maintainer live/sandbox Lambdas + EventBridge schedules removed
    // (SQL work moves to walrus). Shop-sync FIFO queue+DLQ kept for entry enqueue.

    // FR-2139 / FR-240: SQS FIFO a-search-shop-sync.fifo + DLQ (no consumer Lambda).
    // MessageGroupId=shopId; maxReceiveCount 5; visibility sized for future consumer.
    // FR-239 live transition will call onShopLive (enqueue); grant send to entry only.
    const shopSyncQueueName = stagedFifoName(SHOP_SYNC_FIFO_BASE);
    const shopSyncDlqName = stagedFifoName('a-search-shop-sync-dlq.fifo');
    const shopSyncDlq = new sqs.Queue(this, 'ShopSyncDeadLetterQueue', {
      queueName: shopSyncDlqName,
      fifo: true,
      contentBasedDeduplication: false,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });
    const shopSyncQueue = new sqs.Queue(this, 'ShopSyncFifoQueue', {
      queueName: shopSyncQueueName,
      fifo: true,
      contentBasedDeduplication: false,
      visibilityTimeout: cdk.Duration.seconds(
        SHOP_SYNC_QUEUE_VISIBILITY_TIMEOUT_SEC,
      ),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: shopSyncDlq,
        maxReceiveCount: SHOP_SYNC_MAX_RECEIVE_COUNT,
      },
    });
    entry.addEnvironment('SQS_SHOP_SYNC_URL', shopSyncQueue.queueUrl);
    shopSyncQueue.grantSendMessages(entry);

    new cdk.CfnOutput(this, 'ShopSyncFifoQueueUrl', {
      value: shopSyncQueue.queueUrl,
      description: 'FR-2139/FR-240 SQS FIFO a-search-shop-sync.fifo',
    });
    new cdk.CfnOutput(this, 'ShopSyncDeadLetterQueueUrl', {
      value: shopSyncDlq.queueUrl,
      description: 'FR-2139 DLQ for shop-sync FIFO (maxReceiveCount 5)',
    });

    // FR-234: SQS standard a-search-widget-events + DLQ + aggregator + hourly rollup.
    const widgetEventsDlq = new sqs.Queue(this, 'WidgetEventsDeadLetterQueue', {
      queueName: stagedName('a-search-widget-events-dlq'),
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });
    const widgetEventsQueue = new sqs.Queue(this, 'WidgetEventsQueue', {
      queueName: stagedName('a-search-widget-events'),
      visibilityTimeout: cdk.Duration.seconds(180),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: widgetEventsDlq,
        maxReceiveCount: 5,
      },
    });
    entry.addEnvironment('SQS_WIDGET_EVENTS_URL', widgetEventsQueue.queueUrl);
    widgetEventsQueue.grantSendMessages(entry);
    const widgetEventsAggregator = new lambda.Function(
      this,
      'WidgetEventsAggregatorFunction',
      {
        functionName: stagedName('a-search-widget-events-aggregator'),
        runtime: lambda.Runtime.NODEJS_24_X,
        handler: 'entry/src/widgetEventsAggregator.handler',
        code: lambda.Code.fromAsset(entryAssetDir),
        timeout: cdk.Duration.seconds(30),
        memorySize: ENTRY_LAMBDA_MEMORY_MB,
        environment: {
          A_SEARCH_ENV: 'live',
        },
        logGroup: lambdaLogGroup(this, 'WidgetEventsAggregatorLogGroup'),
      },
    );
    widgetEventsQueue.grantConsumeMessages(widgetEventsAggregator);
    widgetEventsAggregator.addEventSource(
      // batchSize > 10 requires maxBatchingWindow (aws-cdk-lib ValidationError
      // MaximumBatchSizeInclusiveGiven); 5s << 180s queue visibility timeout.
      new SqsEventSource(widgetEventsQueue, {
        batchSize: 100,
        maxBatchingWindow: cdk.Duration.seconds(5),
      }),
    );
    const widgetStatsRollup = new lambda.Function(
      this,
      'WidgetStatsRollupFunction',
      {
        functionName: stagedName('a-search-widget-stats-rollup'),
        runtime: lambda.Runtime.NODEJS_24_X,
        handler: 'entry/src/widgetStatsRollup.handler',
        code: lambda.Code.fromAsset(entryAssetDir),
        timeout: cdk.Duration.seconds(60),
        memorySize: ENTRY_LAMBDA_MEMORY_MB,
        environment: {
          A_SEARCH_ENV: 'live',
        },
        logGroup: lambdaLogGroup(this, 'WidgetStatsRollupLogGroup'),
      },
    );
    wireResultsBucketAccess(widgetStatsRollup, resultsBucket);
    new events.Rule(this, 'WidgetStatsRollupSchedule', {
      ruleName: stagedName('a-search-widget-stats-rollup'),
      description: 'FR-234 hourly stats.json rollup (no agent enqueue)',
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
      targets: [new targets.LambdaFunction(widgetStatsRollup)],
    });
    new cdk.CfnOutput(this, 'WidgetEventsQueueUrl', {
      value: widgetEventsQueue.queueUrl,
      description: 'FR-234 SQS a-search-widget-events',
    });
    new cdk.CfnOutput(this, 'WidgetEventsDeadLetterQueueUrl', {
      value: widgetEventsDlq.queueUrl,
      description: 'FR-234 DLQ for widget-events',
    });

    const shopSyncDlqAlarm = new cloudwatch.Alarm(this, 'ShopSyncDlqDepthAlarm', {
      alarmName: stagedName('a-search-shop-sync-dlq-depth'),
      alarmDescription:
        'FR-2139: shop-sync DLQ ApproximateNumberOfMessagesVisible >= 1',
      metric: shopSyncDlq.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    shopSyncDlqAlarm.addAlarmAction(new cw_actions.SnsAction(opsAlarmTopic));

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
        runtime: lambda.Runtime.NODEJS_24_X,
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
    const awinProviderSecret = resolveProviderSecret('awin');
    if (awinProviderSecret) {
      wireProviderSecretEnv(
        awinOnboardingLive,
        awinProviderSecret,
        PROVIDER_CREDENTIAL_KEYS.awin,
      );
    }
    const awinOnboardingSandbox = new lambda.Function(
      this,
      'AwinOnboardingSandboxFunction',
      {
        functionName: stagedName('a-search-awin-onboarding-sandbox'),
        runtime: lambda.Runtime.NODEJS_24_X,
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
    if (awinProviderSecret) {
      wireProviderSecretEnv(
        awinOnboardingSandbox,
        awinProviderSecret,
        PROVIDER_CREDENTIAL_KEYS.awin,
      );
    }

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
        runtime: lambda.Runtime.NODEJS_24_X,
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
    const impactProviderSecret = resolveProviderSecret('impact');
    if (impactProviderSecret) {
      wireProviderSecretEnv(
        impactOnboardingSandbox,
        impactProviderSecret,
        PROVIDER_CREDENTIAL_KEYS.impact,
      );
    }

    // FR-056c: Impact onboarding live Lambda (A_SEARCH_ENV fixed). Schedules -> FR-056e.
    // FR-132: same staged impact asset as sandbox.
    const impactOnboardingLive = new lambda.Function(
      this,
      'ImpactOnboardingLiveFunction',
      {
        functionName: stagedName('a-search-impact-onboarding-live'),
        runtime: lambda.Runtime.NODEJS_24_X,
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
    if (impactProviderSecret) {
      wireProviderSecretEnv(
        impactOnboardingLive,
        impactProviderSecret,
        PROVIDER_CREDENTIAL_KEYS.impact,
      );
    }

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

    // #1343 / FR-258: ComponentsPiece widget-agent FIFO + enqueue Lambda + EventBridge rules
    const AGENT_JOB_TIMEOUT_S = 900;
    const widgetAgentDlq = new sqs.Queue(this, 'WidgetAgentDeadLetterQueue', {
      queueName: stagedFifoName('a-search-widget-agent-dlq.fifo'),
      fifo: true,
      contentBasedDeduplication: false,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });
    const widgetAgentQueue = new sqs.Queue(this, 'WidgetAgentQueue', {
      queueName: stagedFifoName('a-search-widget-agent.fifo'),
      fifo: true,
      contentBasedDeduplication: false,
      visibilityTimeout: cdk.Duration.seconds(AGENT_JOB_TIMEOUT_S + 60),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: widgetAgentDlq,
        maxReceiveCount: 5,
      },
    });
    const widgetAgentEnqueue = new lambda.Function(this, 'WidgetAgentEnqueueFunction', {
      functionName: stagedName('a-search-widget-agent-enqueue'),
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(repoRoot, 'components-piece', 'dispatcher', 'enqueue'),
      ),
      timeout: cdk.Duration.seconds(30),
      memorySize: ENTRY_LAMBDA_MEMORY_MB,
      environment: {
        A_SEARCH_WIDGET_AGENT_QUEUE_URL: widgetAgentQueue.queueUrl,
      },
      logGroup: lambdaLogGroup(this, 'WidgetAgentEnqueueLogGroup'),
    });
    widgetAgentQueue.grantSendMessages(widgetAgentEnqueue);

    const widgetAgentSuffixes = [
      '_host.json',
      'widget.json',
      'feedback.json',
    ];
    for (const suffix of widgetAgentSuffixes) {
      const idSuffix = suffix.replace(/[^a-zA-Z0-9]/g, '');
      new events.Rule(this, `WidgetAgentS3_${idSuffix}`, {
        ruleName: stagedName(`a-search-widget-agent-${idSuffix}`),
        description: `#1343 S3 Object Created suffix ${suffix} -> widget-agent enqueue`,
        eventPattern: {
          source: ['aws.s3'],
          detailType: ['Object Created'],
          detail: {
            bucket: { name: [resultsBucket.bucketName] },
            object: { key: [{ suffix }] },
          },
        },
        targets: [new targets.LambdaFunction(widgetAgentEnqueue)],
      });
    }
    new events.Rule(this, 'WidgetAgentS3_INjson', {
      ruleName: stagedName('a-search-widget-agent-INjson'),
      description: '#3479 S3 Object Created IN/*.json -> widget-agent enqueue',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: { name: [resultsBucket.bucketName] },
          object: { key: [{ wildcard: '*/IN/*.json' }] },
        },
      },
      targets: [new targets.LambdaFunction(widgetAgentEnqueue)],
    });
    new events.Rule(this, 'WidgetAgentSweepDaily', {
      ruleName: stagedName('a-search-widget-agent-sweep'),
      description: '#1343 daily sweep tick for widget-agent (expand per active widget)',
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
      targets: [
        new targets.LambdaFunction(widgetAgentEnqueue, {
          event: events.RuleTargetInput.fromObject({
            eventType: 'sweep',
            widgets: [],
            note: 'ops/expander fills widgets[] from a_search.dbo.Widgets',
          }),
        }),
      ],
    });
    new cdk.CfnOutput(this, 'WidgetAgentQueueUrl', {
      value: widgetAgentQueue.queueUrl,
      description: '#1343 SQS FIFO a-search-widget-agent.fifo',
    });
    new cdk.CfnOutput(this, 'WidgetAgentDlqUrl', {
      value: widgetAgentDlq.queueUrl,
      description: '#1343 widget-agent DLQ (maxReceiveCount 5)',
    });
    new cdk.CfnOutput(this, 'WidgetAgentEnqueueFunctionName', {
      value: widgetAgentEnqueue.functionName,
    });
    new cdk.CfnOutput(this, 'ResultsBucketName', {
      value: resultsBucket.bucketName,
      description:
        'Dedicated a-search results bucket (FR-124 one-bucket; FR-192 region-local; live/ + sandbox/ prefixes)',
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
    for (const sourceId of Object.keys(providerSecrets)) {
      if (!providerSecrets[sourceId]) continue;
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
  wireProviderSecretEnv,
  applyProviderPlainDefaults,
  providerSecretContextKey,
  providerSecretArnPlaceholder,
  deployableProviderSecretArn,
  isLocalProviderFolder,
  PROVIDER_CREDENTIAL_KEYS,
  PROVIDER_PLAIN_DEFAULTS,
  PROVIDER_ENV_FILE,
  BUNDLED_ENV_REQUIRED,
  parseDotEnv,
  readProviderEnvFile,
  requiredBundledEnvKeys,
  assertProviderEnvFileKeys,
  softCheckProviderEnvFileKeys,
  workerLambdaCodeAssetOptions,
  WORKER_LAMBDA_TIMEOUT_SEC,
  WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC,
  ENTRY_LAMBDA_MEMORY_MB,
  WORKER_LAMBDA_MEMORY_MB,
  WORKER_MSSQL_LAMBDA_MEMORY_MB,
  HEAVY_LAMBDA_MEMORY_MB,
};
