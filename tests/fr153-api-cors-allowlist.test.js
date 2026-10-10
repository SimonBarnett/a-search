'use strict';

/**
 * FR-153: HttpApi CORS allowlist from CDK context (corsOrigins).
 * Default synth: localhost-only. Never allow public wildcard *.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const resolvePath = path.join(root, 'cdk', 'lib', 'resolve-cors-origins.js');

describe('FR-153 API Gateway CORS allowlist', () => {
  it('stack + resolve-cors-origins wire corsPreflight from corsOrigins context', () => {
    const stack = fs.readFileSync(stackPath, 'utf8');
    assert.match(stack, /FR-153/);
    assert.match(stack, /corsPreflight|resolveCorsOrigins/);
    assert.match(stack, /corsOrigins/);
    assert.ok(fs.existsSync(resolvePath), 'resolve-cors-origins.js must exist');
    const resolveSrc = fs.readFileSync(resolvePath, 'utf8');
    assert.match(resolveSrc, /corsOrigins/);
    assert.match(resolveSrc, /localhost/);
    assert.doesNotMatch(
      resolveSrc,
      /allowOrigins:\s*\[\s*['"]\*['"]\s*\]/,
      'must not hardcode wildcard origin',
    );
  });

  it('resolveCorsOrigins: default localhost; comma list; reject *', () => {
    const { resolveCorsOrigins } = require('../cdk/lib/resolve-cors-origins');
    assert.deepEqual(resolveCorsOrigins({}), ['http://localhost:3000']);
    assert.deepEqual(resolveCorsOrigins({ corsOrigins: undefined }), [
      'http://localhost:3000',
    ]);
    assert.deepEqual(
      resolveCorsOrigins({
        corsOrigins: 'https://club.example,https://www.club.example',
      }),
      ['https://club.example', 'https://www.club.example'],
    );
    assert.deepEqual(resolveCorsOrigins({ corsOrigins: '  ' }), []);
    assert.throws(
      () => resolveCorsOrigins({ corsOrigins: '*' }),
      /FR-153|wildcard|\*/,
    );
    assert.throws(
      () =>
        resolveCorsOrigins({
          corsOrigins: 'https://ok.example,*',
        }),
      /FR-153|wildcard|\*/,
    );
  });

  it('synth default: HttpApi CorsConfiguration AllowOrigins is localhost-only', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr153-default');
    fs.rmSync(outdir, { recursive: true, force: true });
    const app = new cdk.App({ outdir });
    new ASearchStack(app, 'ASearchStack');
    app.synth();

    const templatePath = path.join(outdir, 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'missing ASearchStack.template.json');
    const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const apis = Object.values(tpl.Resources || {}).filter(
      (res) => res && res.Type === 'AWS::ApiGatewayV2::Api',
    );
    assert.ok(apis.length >= 1, 'expected HttpApi resource');
    const cors = apis[0].Properties && apis[0].Properties.CorsConfiguration;
    assert.ok(cors, 'CorsConfiguration must be present');
    assert.deepEqual(cors.AllowOrigins, ['http://localhost:3000']);
    assert.ok(
      Array.isArray(cors.AllowMethods) && cors.AllowMethods.length >= 1,
      'AllowMethods required',
    );
    assert.ok(
      cors.AllowMethods.includes('GET') || cors.AllowMethods.includes('*'),
      'GET (or ANY) for /selftest and /account/performance',
    );
    assert.ok(
      cors.AllowMethods.includes('POST') || cors.AllowMethods.includes('*'),
      'POST for /search',
    );
    const headers = (cors.AllowHeaders || []).map((h) => String(h).toLowerCase());
    assert.ok(
      headers.includes('authorization'),
      'Authorization header required for JWT',
    );
  });

  it('synth with -c corsOrigins: AllowOrigins matches context list', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr153-custom');
    fs.rmSync(outdir, { recursive: true, force: true });
    const app = new cdk.App({
      outdir,
      context: {
        corsOrigins: 'https://club.example,https://app.club.example',
      },
    });
    new ASearchStack(app, 'ASearchStack');
    app.synth();

    const tpl = JSON.parse(
      fs.readFileSync(path.join(outdir, 'ASearchStack.template.json'), 'utf8'),
    );
    const apis = Object.values(tpl.Resources || {}).filter(
      (res) => res && res.Type === 'AWS::ApiGatewayV2::Api',
    );
    const cors = apis[0].Properties.CorsConfiguration;
    assert.deepEqual(cors.AllowOrigins, [
      'https://club.example',
      'https://app.club.example',
    ]);
    assert.ok(!cors.AllowOrigins.includes('*'));
  });
});
