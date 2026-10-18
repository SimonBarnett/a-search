'use strict';

/**
 * FR #3968: standalone APartsGateway stack.
 * HTTP API GET /parts -> one Node Lambda with S3 Get/Put/List/Head on a-clubs only.
 * Isolated from the main search stack: no VPC, no Secrets Manager, no database drivers.
 */

const path = require('node:path');
const cdk = require('aws-cdk-lib');
const lambda = require('aws-cdk-lib/aws-lambda');
const apigwv2 = require('aws-cdk-lib/aws-apigatewayv2');
const integrations = require('aws-cdk-lib/aws-apigatewayv2-integrations');
const iam = require('aws-cdk-lib/aws-iam');
const logs = require('aws-cdk-lib/aws-logs');
const sqs = require('aws-cdk-lib/aws-sqs');
const { resolveCorsOrigins } = require('./resolve-cors-origins');
const {
  stagePartsGatewayLambdaAsset,
} = require('../../scripts/stage-parts-gateway-lambda-asset');

const A_CLUBS_BUCKET = 'a-clubs';
const FOLDER_EVENTS_QUEUE_NAME = 'a-clubs-new-folders.fifo';
const FOLDER_EVENTS_DLQ_NAME = 'a-clubs-new-folders-dlq.fifo';
/** Lambda timeout 15s; visibility must exceed timeout (FR-164 style 6x). */
const FOLDER_EVENTS_VISIBILITY_SEC = 90;

class PartsGatewayStack extends cdk.Stack {
  /**
   * @param {cdk.App} scope
   * @param {string} id
   * @param {cdk.StackProps} [props]
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const corsOrigins = resolveCorsOrigins({
      corsOrigins: this.node.tryGetContext('corsOrigins'),
    });

    const repoRoot = path.join(__dirname, '..', '..');
    const assetDir = stagePartsGatewayLambdaAsset(repoRoot);

    // FR #3987: FIFO host-folder events for redqueen (outbound pull only).
    const folderEventsDlq = new sqs.Queue(this, 'AClubsFolderEventsDlq', {
      queueName: FOLDER_EVENTS_DLQ_NAME,
      fifo: true,
      contentBasedDeduplication: false,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });
    const folderEventsQueue = new sqs.Queue(this, 'AClubsFolderEventsQueue', {
      queueName: FOLDER_EVENTS_QUEUE_NAME,
      fifo: true,
      contentBasedDeduplication: false,
      visibilityTimeout: cdk.Duration.seconds(FOLDER_EVENTS_VISIBILITY_SEC),
      deadLetterQueue: {
        queue: folderEventsDlq,
        maxReceiveCount: 5,
      },
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // FR #3987: dedicated IAM user for redqueen outbound drain (no inbound ports).
    // Access keys are created out-of-band; never printed. Scope: queue consume + a-clubs R/W.
    const redqueenUser = new iam.User(this, 'RedqueenAnnotatorUser', {
      userName: 'a-search-redqueen-annotator',
    });
    folderEventsQueue.grantConsumeMessages(redqueenUser);
    redqueenUser.addToPolicy(
      new iam.PolicyStatement({
        sid: 'RedqueenAClubsAnnotate',
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:ListBucket',
          's3:GetObjectTagging',
        ],
        resources: [
          `arn:aws:s3:::${A_CLUBS_BUCKET}`,
          `arn:aws:s3:::${A_CLUBS_BUCKET}/*`,
        ],
      }),
    );

    const logGroup = new logs.LogGroup(this, 'PartsGatewayFnLogGroup', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const fn = new lambda.Function(this, 'PartsGatewayFunction', {
      functionName: 'a-search-parts-gateway',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'parts-gateway/src/handler.handler',
      code: lambda.Code.fromAsset(assetDir),
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        A_CLUBS_BUCKET,
        A_CLUBS_FOLDER_EVENTS_QUEUE_URL: folderEventsQueue.queueUrl,
      },
      logGroup,
    });

    // Existing bucket a-clubs --- grant Get/Put/List/Head only (no Delete*, no other buckets)
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'AClubsReadWriteList',
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:ListBucket',
          's3:GetObjectTagging',
          's3:PutObjectTagging',
        ],
        resources: [
          `arn:aws:s3:::${A_CLUBS_BUCKET}`,
          `arn:aws:s3:::${A_CLUBS_BUCKET}/*`,
        ],
      }),
    );

    // Gateway Lambda may only send to the folder-events FIFO (not receive).
    folderEventsQueue.grantSendMessages(fn);

    const httpApi = new apigwv2.HttpApi(this, 'PartsGatewayHttpApi', {
      apiName: 'a-search-parts-gateway',
      description:
        'FR #3968 standalone GET /parts for parts widget (a-clubs S3, auto-create host+GUID)',
      corsPreflight:
        corsOrigins.length > 0
          ? {
              allowHeaders: ['content-type'],
              allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.OPTIONS],
              allowOrigins: corsOrigins,
              maxAge: cdk.Duration.days(1),
            }
          : undefined,
    });

    const integration = new integrations.HttpLambdaIntegration(
      'PartsGatewayIntegration',
      fn,
    );

    httpApi.addRoutes({
      path: '/parts',
      methods: [apigwv2.HttpMethod.GET],
      integration,
    });

    new cdk.CfnOutput(this, 'PartsGatewayApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'HTTP API base URL for parts-gateway GET /parts',
    });

    new cdk.CfnOutput(this, 'PartsGatewayFunctionName', {
      value: fn.functionName,
      description: 'Lambda name for parts-gateway',
    });

    new cdk.CfnOutput(this, 'AClubsBucketName', {
      value: A_CLUBS_BUCKET,
      description: 'S3 bucket used for host/widget trees (existing)',
    });

    new cdk.CfnOutput(this, 'AClubsFolderEventsQueueUrl', {
      value: folderEventsQueue.queueUrl,
      description: 'FR #3987 SQS FIFO a-clubs-new-folders.fifo (redqueen drain)',
    });

    new cdk.CfnOutput(this, 'AClubsFolderEventsDlqUrl', {
      value: folderEventsDlq.queueUrl,
      description: 'FR #3987 DLQ for a-clubs-new-folders.fifo',
    });

    new cdk.CfnOutput(this, 'RedqueenAnnotatorUserName', {
      value: redqueenUser.userName,
      description:
        'FR #3987 IAM user for redqueen drain (create access keys out-of-band; never commit)',
    });
  }
}

module.exports = {
  PartsGatewayStack,
  A_CLUBS_BUCKET,
  FOLDER_EVENTS_QUEUE_NAME,
  FOLDER_EVENTS_DLQ_NAME,
  FOLDER_EVENTS_VISIBILITY_SEC,
};
