'use strict';

/**
 * FR #3945: EntryJwtSecret created without jwtSecretArn must be JSON with
 * JWT_ISSUER / JWT_AUDIENCE / JWT_JWKS_URL / JWT_SECRET so CFN dynamic refs resolve.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ensureDefaultStackSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const deployPath = path.join(root, 'docs', 'deploy.md');
const matrixPath = path.join(root, 'docs', 'secrets-matrix.md');
const JWT_KEYS = ['JWT_ISSUER', 'JWT_AUDIENCE', 'JWT_JWKS_URL', 'JWT_SECRET'];

describe('FR-3945 EntryJwtSecret JSON GenerateSecretString', () => {
  it('stack source uses generateSecretString + RETAIN for created EntryJwtSecret', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /generateSecretString/);
    assert.match(text, /secretStringTemplate/);
    assert.match(text, /generateStringKey:\s*['"]JWT_SECRET['"]/);
    assert.match(text, /RemovalPolicy\.RETAIN/);
    for (const k of JWT_KEYS) {
      assert.match(text, new RegExp(k));
    }
  });

  it('docs describe JSON placeholder secret when jwtSecretArn omitted', () => {
    const deploy = fs.readFileSync(deployPath, 'utf8');
    assert.match(deploy, /GenerateSecretString|secretStringTemplate|JSON placeholder|FR-3945|FR #3945/i);
    assert.match(deploy, /JWT_ISSUER/);
    assert.doesNotMatch(deploy, /eyJ[A-Za-z0-9_-]{20,}/);

    const matrix = fs.readFileSync(matrixPath, 'utf8');
    assert.match(matrix, /GenerateSecretString|JSON placeholder|FR-3945|FR #3945/i);
  });

  it('synth without jwtSecretArn: EntryJwtSecret has JSON template with four keys', () => {
    const { outDir } = ensureDefaultStackSynth(root);
    const templatePath = path.join(outDir, 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'missing ASearchStack.template.json');
    const raw = fs.readFileSync(templatePath, 'utf8');
    const tpl = JSON.parse(raw);
    const secrets = Object.entries(tpl.Resources || {}).filter(
      ([, res]) => res && res.Type === 'AWS::SecretsManager::Secret',
    );
    const entryJwt = secrets.find(([logicalId, res]) => {
      const desc = String((res.Properties && res.Properties.Description) || '');
      return /EntryJwt|JWT_\*|FR-136/i.test(desc) || /EntryJwt/i.test(logicalId);
    });
    assert.ok(entryJwt, 'missing EntryJwtSecret resource');
    const [, res] = entryJwt;
    const gen = res.Properties && res.Properties.GenerateSecretString;
    assert.ok(gen && typeof gen === 'object', 'GenerateSecretString must be present (not empty {})');
    assert.ok(Object.keys(gen).length > 0, 'GenerateSecretString must not be empty object');
    const template = String(gen.SecretStringTemplate || '');
    assert.ok(template, 'SecretStringTemplate required');
    const parsed = JSON.parse(template);
    for (const k of ['JWT_ISSUER', 'JWT_AUDIENCE', 'JWT_JWKS_URL']) {
      assert.ok(
        typeof parsed[k] === 'string' && parsed[k].length > 0,
        k + ' must be non-empty placeholder in SecretStringTemplate',
      );
    }
    assert.equal(gen.GenerateStringKey, 'JWT_SECRET');
    assert.doesNotMatch(raw, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/);
    assert.equal(res.DeletionPolicy, 'Retain');
  });
});