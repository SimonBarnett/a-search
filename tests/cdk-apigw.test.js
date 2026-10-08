'use strict';

/**
 * FR-035: CDK API Gateway POST /search → entry Lambda.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');

describe('FR-035 CDK API Gateway POST /search', () => {
  it('stack wires HttpApi POST /search to entry', () => {
    const text = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(text, /HttpApi|apigatewayv2/);
    assert.match(text, /\/search/);
    assert.match(text, /HttpMethod\.POST|POST/);
    assert.match(text, /HttpLambdaIntegration|EntrySearchIntegration/);
    assert.match(text, /SearchApiUrl/);
  });

  it('npm run synth exits 0 and template has route + integration', () => {
    const r = runCdkSynth(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);

    const templatePath = path.join(
      root,
      'cdk.out',
      'ASearchStack.template.json',
    );
    assert.ok(fs.existsSync(templatePath), 'synth must emit ASearchStack.template.json');
    const tpl = fs.readFileSync(templatePath, 'utf8');
    assert.match(tpl, /AWS::ApiGatewayV2::Api|AWS::ApiGatewayV2::Route/);
    assert.match(tpl, /POST\s*\/search|\/search/);
    assert.match(tpl, /AWS::ApiGatewayV2::Integration|AWS::Lambda::Permission/);
    assert.match(tpl, /a-search-entry|EntryFunction/);
  });
});
