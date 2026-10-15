'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');

describe('MRB #2112 hostile FR-237 Wix connect', () => {
  it('Decision LOCKED + CDK wix webhook alongside shopify + merchant shops', () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-237.md'), 'utf8');
    assert.match(fr, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(fr, /client_credentials/);
    assert.match(fr, /instanceId/);
    assert.match(fr, /FR-251/);

    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /path:\s*'\/webhooks\/shop\/wix'/);
    assert.match(stack, /path:\s*'\/webhooks\/shop\/shopify'/);
    assert.match(stack, /path:\s*'\/merchant\/shops'/);
  });

  it('entry wires wix + shopify webhooks; merchantShops maps invalid_signed_instance', () => {
    const idx = fs.readFileSync(path.join(ROOT, 'entry', 'src', 'index.js'), 'utf8');
    assert.match(idx, /handleWixWebhook/);
    assert.match(idx, /handleShopifyWebhook/);
    const ms = fs.readFileSync(
      path.join(ROOT, 'entry', 'src', 'merchantShops.js'),
      'utf8',
    );
    assert.match(ms, /invalid_signed_instance/);
  });

  it('adapter registered; token helper never vaults access tokens', () => {
    const adapters = require('../shared/shops/adapters');
    assert.equal(typeof adapters.getAdapter('wix').startConnect, 'function');
    const tokenSrc = fs.readFileSync(
      path.join(ROOT, 'providers', 'local', 'wix', 'src', 'token.js'),
      'utf8',
    );
    assert.match(tokenSrc, /client_credentials/);
    assert.doesNotMatch(tokenSrc, /vault\.put|createMemoryVault|createCredentialsVault/);
  });

  it('wix skillbook notes oauth2 client_credentials + instance_id', () => {
    const skill = fs.readFileSync(
      path.join(
        ROOT,
        'providers',
        'local',
        'wix',
        '.grok',
        'skills',
        'a-search-wix',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /client_credentials|oauth2\/token/i);
    assert.match(skill, /instance_id|instanceId/i);
  });
});
