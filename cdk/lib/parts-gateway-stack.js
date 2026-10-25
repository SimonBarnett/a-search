'use strict';

/**
 * FR #3968: standalone APartsGateway stack.
 * HTTP API GET /parts -> one Node Lambda with S3 Get/Put/List/Head on a-clubs only.
 * CORS allowOrigins hardcoded ['*'] (do not call the main-stack CORS allowlist helper; FR-153 keeps * rejected there).
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
const events = require('aws-cdk-lib/aws-events');
const targets = require('aws-cdk-lib/aws-events-targets');
const s3 = require('aws-cdk-lib/aws-s3');
const {
  stagePartsGatewayLambdaAsset,
} = require('../../scripts/stage-parts-gateway-lambda-asset');

const A_CLUBS_BUCKET = 'a-clubs';
const FOLDER_EVENTS_QUEUE_NAME = 'a-clubs-new-folders.fifo';
const FOLDER_EVENTS_DLQ_NAME = 'a-clubs-new-folders-dlq.fifo';
/** FR #4827: EventBridge object-created events (widget.json, searches.json, markers). */
const CHANGES_QUEUE_NAME = 'a-clubs-changes';
const CHANGES_DLQ_NAME = 'a-clubs-changes-dlq';
const CHANGES_VISIBILITY_SEC = 180;
/** Lambda timeout 15s; visibility must exceed timeout. */
const FOLDER_EVENTS_VISIBILITY_SEC = 90;

class PartsGatewayStack extends cdk.Stack {
  /**
   * @param {cdk.App} scope
   * @param {string} id
   * @param {cdk.StackProps} [props]
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const repoRoot = path.join(__dirname, '..', '..');
    const assetDir = stagePartsGatewayLambdaAsset(repoRoot);

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

    // IAM user for redqueen outbound drain (access keys out-of-band; never printed).
    const redqueenUser = new iam.User(this, 'RedqueenAnnotatorUser', {
      userName: 'a-search-redqueen-annotator',
    });
    folderEventsQueue.grantConsumeMessages(redqueenUser);

    // FR #4827: standard queue for a-clubs object-created events. Not FIFO.
    const changesDlq = new sqs.Queue(this, 'AClubsChangesDlq', {
      queueName: CHANGES_DLQ_NAME,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });
    const changesQueue = new sqs.Queue(this, 'AClubsChangesQueue', {
      queueName: CHANGES_QUEUE_NAME,
      visibilityTimeout: cdk.Duration.seconds(CHANGES_VISIBILITY_SEC),
      deadLetterQueue: {
        queue: changesDlq,
        maxReceiveCount: 5,
      },
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });
    changesQueue.grantConsumeMessages(redqueenUser);

    // FR #4890: enable EventBridge on the existing imported a-clubs bucket via CDK.
    // fromBucketName => unmanaged Custom::S3BucketNotifications (Managed=false) so
    // existing Topic/Queue/Lambda notification configs are merged, not replaced.
    // Delete is a no-op for EventBridge (handler treats it as external once present).
    const aClubsImported = s3.Bucket.fromBucketName(this, 'AClubsImportedBucket', A_CLUBS_BUCKET);
    aClubsImported.enableEventBridgeNotification();

    // Direct EventBridge → SQS for precise file suffixes (no Lambda hop).
    const changeFileSuffixes = [
      { id: 'AClubsChangesWidgetJson', ruleName: 'a-clubs-changes-widget-json', suffix: 'widget.json' },
      { id: 'AClubsChangesSearchesJson', ruleName: 'a-clubs-changes-searches-json', suffix: 'searches.json' },
    ];
    for (let i = 0; i < changeFileSuffixes.length; i += 1) {
      const spec = changeFileSuffixes[i];
      new events.Rule(this, spec.id, {
        ruleName: spec.ruleName,
        description: `FR #4827 Object Created suffix ${spec.suffix} -> a-clubs-changes`,
        eventPattern: {
          source: ['aws.s3'],
          detailType: ['Object Created'],
          detail: {
            bucket: { name: [A_CLUBS_BUCKET] },
            object: { key: [{ suffix: spec.suffix }] },
          },
        },
        targets: [new targets.SqsQueue(changesQueue)],
      });
    }

    // FR #4833: suffix `/` over-matches folder-like keys. Enqueue Lambda keeps
    // only host marker `{host}/` and GUID marker `{host}/{uuid}/`.
    const markerEnqueueFn = new lambda.Function(this, 'AClubsMarkerEnqueueFunction', {
      functionName: 'a-search-aclubs-marker-enqueue',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'parts-gateway/src/enqueueAClubsChange.handler',
      code: lambda.Code.fromAsset(assetDir),
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        A_CLUBS_CHANGES_QUEUE_URL: changesQueue.queueUrl,
      },
      logGroup: new logs.LogGroup(this, 'AClubsMarkerEnqueueLogGroup', {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    changesQueue.grantSendMessages(markerEnqueueFn);
    new events.Rule(this, 'AClubsChangesMarkers', {
      ruleName: 'a-clubs-changes-markers',
      description:
        'FR #4833 Object Created suffix / -> marker enqueue Lambda (host/GUID only)',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: { name: [A_CLUBS_BUCKET] },
          object: { key: [{ suffix: '/' }] },
        },
      },
      targets: [new targets.LambdaFunction(markerEnqueueFn)],
    });

    // FR #4122: object annotations on folder markers (Put/Get/List/DeleteObjectAnnotation).
    // FR #4827: CopyObject so marker metadata REPLACE is allowed on the annotator user.
    redqueenUser.addToPolicy(
      new iam.PolicyStatement({
        sid: 'RedqueenAClubsAnnotate',
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:CopyObject',
          's3:ListBucket',
          's3:GetObjectTagging',
          's3:PutObjectTagging',
          's3:PutObjectAnnotation',
          's3:GetObjectAnnotation',
          's3:ListObjectAnnotations',
          's3:DeleteObjectAnnotation',
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

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'AClubsReadWriteList',
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:CopyObject',
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
      corsPreflight: {
        // FR #4177: widget sends X-Parent-Origin when embedded (Wix); preflight
        // must allow it or browsers block GET /parts.
        allowHeaders: ['content-type', 'x-parent-origin'],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.OPTIONS],
        allowOrigins: ['*'],
        allowCredentials: false,
        maxAge: cdk.Duration.days(1),
      },
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
      description: 'SQS FIFO a-clubs-new-folders.fifo (redqueen drain)',
    });

    new cdk.CfnOutput(this, 'AClubsFolderEventsDlqUrl', {
      value: folderEventsDlq.queueUrl,
      description: 'DLQ for a-clubs-new-folders.fifo',
    });

    new cdk.CfnOutput(this, 'AClubsChangesQueueUrl', {
      value: changesQueue.queueUrl,
      description: 'FR #4827 SQS a-clubs-changes (EventBridge Object Created)',
    });

    new cdk.CfnOutput(this, 'AClubsChangesDlqUrl', {
      value: changesDlq.queueUrl,
      description: 'DLQ for a-clubs-changes',
    });

    new cdk.CfnOutput(this, 'RedqueenAnnotatorUserName', {
      value: redqueenUser.userName,
      description:
        'IAM user for redqueen drain (create access keys out-of-band; never commit)',
    });
  }
}

module.exports = {
  PartsGatewayStack,
  A_CLUBS_BUCKET,
  FOLDER_EVENTS_QUEUE_NAME,
  FOLDER_EVENTS_DLQ_NAME,
  FOLDER_EVENTS_VISIBILITY_SEC,
  CHANGES_QUEUE_NAME,
  CHANGES_DLQ_NAME,
  CHANGES_VISIBILITY_SEC,
};
