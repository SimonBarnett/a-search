'use strict';

/**
 * FR #3999: standalone AAffiliates stack.
 * Private S3 bucket a-affiliates + daily Node 20 Lambda (EventBridge rate 1 day;
 * FR #4195 7-day per-affiliate refresh inside the job).
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
const sqs = require('aws-cdk-lib/aws-sqs');
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

    // Private bucket: block public, SSE-S3, SSL, RETAIN. Import deletes files
    // after DB load (FR #4001/#4195); lifecycle expires non-empty objects after
    // 35 days as a safety net (zero-byte markers kept via objectSizeGreaterThan: 0).
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

    // FR #4196: import queue + DLQ (on-prem drain; Lambda only SendMessage).
    // Not deployed by this issue alone --- CDK defines the resource for later synth.
    const importDlq = new sqs.Queue(this, 'AffiliateImportDeadLetterQueue', {
      queueName: 'a-search-affiliate-import-dlq',
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });
    const importQueue = new sqs.Queue(this, 'AffiliateImportQueue', {
      queueName: 'a-search-affiliate-import',
      visibilityTimeout: cdk.Duration.minutes(5),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: importDlq,
        maxReceiveCount: 3,
      },
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
        A_SEARCH_AFFILIATE_IMPORT_QUEUE_URL: importQueue.queueUrl,
      },
      logGroup,
    });
    importQueue.grantSendMessages(fn);

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

    // Daily schedule (rate 1 day). Job skips affiliates fresher than defaultage
    // (merchant > provider > _root/; lastdownload clock; FR #4931).
    const rule = new events.Rule(this, 'AffiliatesWeeklyRule', {
      ruleName: 'a-search-affiliates-weekly',
      description:
        'FR #4195 daily affiliate feed download (7-day refresh inside job)',
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
    });
    rule.addTarget(new targets.LambdaFunction(fn));

    new cdk.CfnOutput(this, 'AffiliatesBucketName', {
      value: bucket.bucketName,
      description:
        'S3 bucket for affiliate provider/feed trees (a-affiliates; fallback a-search-affiliates if name taken)',
    });

    new cdk.CfnOutput(this, 'AffiliatesWeeklyFunctionName', {
      value: fn.functionName,
      description: 'Lambda name for daily affiliate feed download (legacy weekly name)',
    });

    new cdk.CfnOutput(this, 'AffiliatesWeeklyRuleName', {
      value: rule.ruleName,
      description: 'EventBridge rule rate(1 day) for affiliates daily job',
    });

    new cdk.CfnOutput(this, 'AffiliateImportQueueUrl', {
      value: importQueue.queueUrl,
      description:
        'FR #4196 affiliate import SQS (download enqueues; redqueen drains)',
    });
    new cdk.CfnOutput(this, 'AffiliateImportDeadLetterQueueUrl', {
      value: importDlq.queueUrl,
      description: 'FR #4196 DLQ for a-search-affiliate-import',
    });
  }
}

module.exports = {
  AffiliatesStack,
  A_AFFILIATES_BUCKET,
  A_AFFILIATES_BUCKET_FALLBACK,
};
