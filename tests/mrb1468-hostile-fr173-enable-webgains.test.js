'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('mrb1468: webgains+tradedoubler enabled; floors 2*enabled=32', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'providers/registry.json'), 'utf8'));
  const byId = new Map(reg.sources.map((s) => [s.id, s]));
  assert.equal(byId.get('webgains').enabled.live, true);
  assert.equal(byId.get('webgains').enabled.sandbox, true);
  assert.equal(byId.get('tradedoubler').enabled.live, true);
  assert.equal(byId.get('tradedoubler').enabled.sandbox, true);
  const enabled = reg.sources.filter((s) => s.enabled.live && s.enabled.sandbox);
  assert.ok(enabled.some((s) => s.id === 'webgains'));
  assert.ok(enabled.some((s) => s.id === 'shopify'));
  assert.equal(enabled.length * 2, 32);
});

test('mrb1468: CDK keys webgains+tradedoubler; secrets-matrix not stay-dark', () => {
  const stack = fs.readFileSync(path.join(ROOT, 'cdk/lib/a-search-stack.js'), 'utf8');
  assert.match(stack, /\bwebgains\s*:\s*\[/);
  assert.match(stack, /WEBGAINS_API_KEY/);
  assert.match(stack, /\btradedoubler\s*:\s*\[/);
  assert.match(stack, /TRADEDOUBLER_API_KEY/);
  assert.equal(stack.includes('<<<<<<<'), false);
  const matrix = fs.readFileSync(path.join(ROOT, 'docs/secrets-matrix.md'), 'utf8');
  assert.match(matrix, /WEBGAINS_API_KEY/);
  const omit = matrix.split(/Stay-dark omitted/i)[1] || '';
  assert.doesNotMatch(omit.slice(0, 400), /\bwebgains\b/i);
  assert.doesNotMatch(omit.slice(0, 400), /\btradedoubler\b/i);
});
