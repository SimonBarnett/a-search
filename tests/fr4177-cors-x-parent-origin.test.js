'use strict';

/**
 * FR #4177: APartsGateway CORS preflight must allow X-Parent-Origin so
 * embedded (Wix) widgets can GET /parts.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STACK = path.join(ROOT, 'cdk', 'lib', 'parts-gateway-stack.js');

describe('FR #4177 parts-gateway CORS x-parent-origin', () => {
  it('corsPreflight allowHeaders includes x-parent-origin and content-type', () => {
    const src = fs.readFileSync(STACK, 'utf8');
    assert.match(src, /corsPreflight\s*:/);
    // Contiguous allowHeaders list must name the widget header (case-insensitive in API GW).
    assert.match(
      src,
      /allowHeaders\s*:\s*\[[^\]]*['"]x-parent-origin['"][^\]]*\]/i,
    );
    assert.match(
      src,
      /allowHeaders\s*:\s*\[[^\]]*['"]content-type['"][^\]]*\]/i,
    );
  });

  it('README documents X-Parent-Origin on CORS preflight', () => {
    const readme = fs.readFileSync(
      path.join(ROOT, 'cdk', 'README-parts-gateway.md'),
      'utf8',
    );
    assert.match(readme, /x-parent-origin|X-Parent-Origin/i);
    assert.match(readme, /allowHeaders|CORS|corsPreflight/i);
  });

  it('CDK synth CorsConfiguration AllowHeaders includes x-parent-origin', async () => {
    let cdk;
    let apigwv2;
    let assertions;
    try {
      cdk = require('aws-cdk-lib');
      apigwv2 = require('aws-cdk-lib/aws-apigatewayv2');
      assertions = require('aws-cdk-lib/assertions');
    } catch {
      // Source pin above is the durable CI gate when cdk node_modules are absent.
      return;
    }
    // Minimal mirror of stack CORS so synth asserts CloudFormation AllowHeaders
    // without staging the full Lambda asset.
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Fr4177CorsProbe');
    const src = fs.readFileSync(STACK, 'utf8');
    const m = src.match(/allowHeaders\s*:\s*\[([^\]]+)\]/i);
    assert.ok(m, 'parts-gateway-stack must declare allowHeaders');
    const headers = m[1]
      .split(',')
      .map((s) => s.replace(/['"\s]/g, ''))
      .filter(Boolean);
    assert.ok(
      headers.map((h) => h.toLowerCase()).includes('x-parent-origin'),
      `allowHeaders missing x-parent-origin: ${headers.join(',')}`,
    );
    new apigwv2.HttpApi(stack, 'ProbeApi', {
      corsPreflight: {
        allowHeaders: headers,
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ['*'],
        allowCredentials: false,
      },
    });
    const template = assertions.Template.fromStack(stack);
    const apis = template.findResources('AWS::ApiGatewayV2::Api');
    const apiKeys = Object.keys(apis);
    assert.ok(apiKeys.length >= 1);
    const cors = apis[apiKeys[0]].Properties.CorsConfiguration;
    assert.ok(cors, 'CorsConfiguration missing');
    const allow = (cors.AllowHeaders || []).map((h) => String(h).toLowerCase());
    assert.ok(
      allow.includes('x-parent-origin'),
      `synth AllowHeaders=${JSON.stringify(cors.AllowHeaders)}`,
    );
    assert.ok(allow.includes('content-type'));
  });
});
