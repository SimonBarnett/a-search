'use strict';

/**
 * FR #4008 / #4269: standalone AMerchants stack.
 * Private S3 bucket a-merchants + onCreated Lambda + daily dual-bucket Lambda
 * (EventBridge rate 1 day). Daily covers a-merchants and optional a-affiliates
 * via A_AFFILIATES_BUCKET; only enabled=1 folders with lastdownload >= 7 days
 * stale. Affiliates reuse affiliates/src/downloadOne. Isolated from the main
 * search stack and parts-gateway.
 *
 * Choice: ONE scheduled Lambda in this stack covers both buckets (affiliates
 * bucket optional if unset). Documented in docs/a-merchants.md.
 */

const path = require('node:path');
const cdk = require('aws-cdk-lib');
const s3 = require('aws-cdk-lib/aws-s3');
const s3n = require('aws-cdk-lib/aws-s3-notifications');
const lambda = require('aws-cdk-lib/aws-lambda');
const iam = require('aws-cdk-lib/aws-iam');
const logs = require('aws-cdk-lib/aws-logs');
const events = require('aws-cdk-lib/aws-events');
const targets = require('aws-cdk-lib/aws-events-targets');
const {
  stageMerchantsLambdaAsset,
} = require('../../scripts/stage-merchants-lambda-asset');

const A_MERCHANTS_BUCKET = 'a-merchants';
/** Documented fallback if global name a-merchants is taken at deploy time. */
const A_MERCHANTS_BUCKET_FALLBACK = 'a-search-merchants';
/** Optional dual-bucket weekly target (FR #3999). */
const A_AFFILIATES_BUCKET = 'a-affiliates';

class MerchantsStack extends cdk.Stack {
  /**
   * @param {cdk.App} scope
   * @param {string} id
   * @param {cdk.StackProps} [props]
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const repoRoot = path.join(__dirname, '..', '..');
    const assetDir = stageMerchantsLambdaAsset(repoRoot);

    const bucket = new s3.Bucket(this, 'MerchantsBucket', {
      bucketName: A_MERCHANTS_BUCKET,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      lifecycleRules: [
        {
          id: 'ExpireNonEmptyObjects35Days',
          enabled: true,
          expiration: cdk.Duration.days(35),
          objectSizeGreaterThan: 0,
        },
      ],
      eventBridgeEnabled: false,
    });

    const weeklyLogGroup = new logs.LogGroup(this, 'MerchantsWeeklyFnLogGroup', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const onCreatedLogGroup = new logs.LogGroup(
      this,
      'MerchantsOnCreatedFnLogGroup',
      {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      },
    );

    const commonEnv = {
      A_MERCHANTS_BUCKET: A_MERCHANTS_BUCKET,
      A_AFFILIATES_BUCKET: A_AFFILIATES_BUCKET,
    };

    const weeklyFn = new lambda.Function(this, 'MerchantsWeeklyFunction', {
      functionName: 'a-search-merchants-weekly',
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'merchants/src/handler.handler',
      code: lambda.Code.fromAsset(assetDir),
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      environment: commonEnv,
      logGroup: weeklyLogGroup,
    });

    const onCreatedFn = new lambda.Function(this, 'MerchantsOnCreatedFunction', {
      functionName: 'a-search-merchants-oncreated',
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'merchants/src/handler.onCreatedHandler',
      code: lambda.Code.fromAsset(assetDir),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: commonEnv,
      logGroup: onCreatedLogGroup,
    });

    const merchantsRw = new iam.PolicyStatement({
      sid: 'AMerchantsReadWriteListDelete',
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:ListBucket',
        's3:DeleteObject',
      ],
      resources: [
        `arn:aws:s3:::${A_MERCHANTS_BUCKET}`,
        `arn:aws:s3:::${A_MERCHANTS_BUCKET}/*`,
      ],
    });

    const affiliatesRw = new iam.PolicyStatement({
      sid: 'AAffiliatesReadWriteListDelete',
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:ListBucket',
        's3:DeleteObject',
      ],
      resources: [
        `arn:aws:s3:::${A_AFFILIATES_BUCKET}`,
        `arn:aws:s3:::${A_AFFILIATES_BUCKET}/*`,
      ],
    });

    weeklyFn.addToRolePolicy(merchantsRw);
    weeklyFn.addToRolePolicy(affiliatesRw);
    onCreatedFn.addToRolePolicy(merchantsRw);
    onCreatedFn.addToRolePolicy(affiliatesRw);

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(onCreatedFn),
    );

    const rule = new events.Rule(this, 'MerchantsWeeklyRule', {
      ruleName: 'a-search-merchants-weekly',
      description:
        'FR #4269 daily merchants (+ affiliates) download --- enabled=1 and lastdownload >= 7d stale; ONE Lambda both buckets',
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
    });
    rule.addTarget(new targets.LambdaFunction(weeklyFn));

    new cdk.CfnOutput(this, 'MerchantsBucketName', {
      value: bucket.bucketName,
      description:
        'S3 bucket for merchant provider/parts trees (a-merchants; fallback a-search-merchants if name taken)',
    });

    new cdk.CfnOutput(this, 'MerchantsWeeklyFunctionName', {
      value: weeklyFn.functionName,
      description:
        'Lambda name for weekly merchants + affiliates parts download',
    });

    new cdk.CfnOutput(this, 'MerchantsOnCreatedFunctionName', {
      value: onCreatedFn.functionName,
      description: 'Lambda name for ObjectCreated immediate merchant download',
    });

    new cdk.CfnOutput(this, 'MerchantsWeeklyRuleName', {
      value: rule.ruleName,
      description: 'EventBridge rule rate(1 day) for merchants daily job (FR #4269)',
    });
  }
}

module.exports = {
  MerchantsStack,
  A_MERCHANTS_BUCKET,
  A_MERCHANTS_BUCKET_FALLBACK,
  A_AFFILIATES_BUCKET,
};
