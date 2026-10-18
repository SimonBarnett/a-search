'use strict';

/**
 * FR #3999: standalone AAffiliates stack.
 * Private S3 bucket a-affiliates + weekly Node 20 Lambda (EventBridge rate 7 days).
 * Isolated from the main search stack, parts-gateway, clubs bucket, and club-db.
 *
 * v1 uses Lambda (not Fargate). Fargate is a follow-up if 15 min / ephemeral
 * storage limits are hit by large affiliate feeds.
 *
 * Bucket name in code/outputs: a-affiliates. If the global name is taken at
 * deploy time, operators may fall back to a-search-affiliates and record the
 * real name in stack outputs (document only; code keeps a-affiliates).
 */

const path = require('node:path');
const cdk = require('aws-cdk-lib');
const s3 = require('aws-cdk-lib/aws-s3');
const lambda = require('aws-cdk-lib/aws-lambda');
const iam = require('aws-cdk-lib/aws-iam');
const logs = require('aws-cdk-lib/aws-logs');
const events = require('aws-cdk-lib/aws-events');
const targets = require('aws-cdk-lib/aws-events-targets');
const {
  stageAffiliatesLambdaAsset,
} = require('../../scripts/stage-affiliates-lambda-asset');

const A_AFFILIATES_BUCKET = 'a-affiliates';
/** Documented fallback if global name a-affiliates is taken at deploy time. */
const A_AFFILIATES_BUCKET_FALLBACK = 'a-search-affiliates';

class AffiliatesStack extends cdk.Stack {
  /**
   * @param {cdk.App} scope
   * @param {string} id
   * @param {cdk.StackProps} [props]
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const repoRoot = path.join(__dirname, '..', '..');
    const assetDir = stageAffiliatesLambdaAsset(repoRoot);

    // Private bucket: block public, SSE-S3, SSL, RETAIN. Lambda retention (N=4)
    // is primary; lifecycle expires non-empty objects after 35 days as a safety
    // net (zero-byte markers kept via objectSizeGreaterThan: 0).
    const bucket = new s3.Bucket(this, 'AffiliatesBucket', {
      bucketName: A_AFFILIATES_BUCKET,
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
    });

    const logGroup = new logs.LogGroup(this, 'AffiliatesWeeklyFnLogGroup', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const fn = new lambda.Function(this, 'AffiliatesWeeklyFunction', {
      functionName: 'a-search-affiliates-weekly',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'affiliates/src/handler.handler',
      code: lambda.Code.fromAsset(assetDir),
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      environment: {
        A_AFFILIATES_BUCKET: A_AFFILIATES_BUCKET,
      },
      logGroup,
    });

    fn.addToRolePolicy(
      new iam.PolicyStatement({
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
      }),
    );

    // Weekly schedule (rate 7 days). Sunday cron alternative documented in README.
    const rule = new events.Rule(this, 'AffiliatesWeeklyRule', {
      ruleName: 'a-search-affiliates-weekly',
      description: 'FR #3999 weekly affiliate parts download',
      schedule: events.Schedule.rate(cdk.Duration.days(7)),
    });
    rule.addTarget(new targets.LambdaFunction(fn));

    new cdk.CfnOutput(this, 'AffiliatesBucketName', {
      value: bucket.bucketName,
      description:
        'S3 bucket for affiliate provider/parts trees (a-affiliates; fallback a-search-affiliates if name taken)',
    });

    new cdk.CfnOutput(this, 'AffiliatesWeeklyFunctionName', {
      value: fn.functionName,
      description: 'Lambda name for weekly affiliate parts download',
    });

    new cdk.CfnOutput(this, 'AffiliatesWeeklyRuleName', {
      value: rule.ruleName,
      description: 'EventBridge rule rate(7 days) for affiliates weekly job',
    });
  }
}

module.exports = {
  AffiliatesStack,
  A_AFFILIATES_BUCKET,
  A_AFFILIATES_BUCKET_FALLBACK,
};
