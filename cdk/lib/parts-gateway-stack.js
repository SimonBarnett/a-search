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
const { resolveCorsOrigins } = require('./resolve-cors-origins');
const {
  stagePartsGatewayLambdaAsset,
} = require('../../scripts/stage-parts-gateway-lambda-asset');

const A_CLUBS_BUCKET = 'a-clubs';

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
  }
}

module.exports = {
  PartsGatewayStack,
  A_CLUBS_BUCKET,
};
