'use strict';

/**
 * MRB #1424 hostile pin: FR-176 enable flexoffers registry + credential keys + floors.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('mrb1424: flexoffers enabled both envs; partnerize kept; floors 2*enabled', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'providers/registry.json'), 'utf8'));
  const byId = new Map(reg.sources.map((s) => [s.id, s]));
  const fo = byId.get('flexoffers');
  assert.equal(fo.enabled.live, true);
  assert.equal(fo.enabled.sandbox, true);
  const pz = byId.get('partnerize');
  assert.equal(pz.enabled.live, true);
  assert.equal(pz.enabled.sandbox, true);
  const enabled = reg.sources.filter((s) => s.enabled.live && s.enabled.sandbox).map((s) => s.id);
  assert.ok(enabled.includes('flexoffers'));
  assert.ok(enabled.includes('partnerize'));
  assert.equal(enabled.length * 2, 24);
});

test('mrb1424: CDK PROVIDER_CREDENTIAL_KEYS includes flexoffers FR-138 names', () => {
  const stack = fs.readFileSync(path.join(ROOT, 'cdk/lib/a-search-stack.js'), 'utf8');
  assert.match(stack, /\bflexoffers\s*:\s*\[/);
  assert.match(stack, /FLEXOFFERS_API_KEY/);
  assert.match(stack, /FLEXOFFERS_API_TOKEN/);
  assert.match(stack, /FLEXOFFERS_FEED_TOKEN/);
  assert.match(stack, /FLEXOFFERS_PUBLISHER_ID/);
  assert.match(stack, /FLEXOFFERS_AFFILIATE_ID/);
  assert.match(stack, /\bpartnerize\s*:\s*\[/);
  assert.equal(stack.includes('<<<<<<<'), false);
});

test('mrb1424: FR-176 Decision LOCKED; secrets-matrix has flexoffers not stay-dark', () => {
  const fr = fs.readFileSync(path.join(ROOT, 'docs/fr/FR-176.md'));
  assert.notEqual(fr[0], 0xef);
  const frt = fr.toString('utf8');
  assert.match(frt, /Decision:\s*LOCKED|Decision.*LOCKED/i);
  const matrix = fs.readFileSync(path.join(ROOT, 'docs/secrets-matrix.md'), 'utf8');
  assert.match(matrix, /flexoffers/i);
  assert.match(matrix, /FLEXOFFERS_API_KEY/);
  const omit = matrix.split(/Stay-dark omitted/i)[1] || '';
  assert.doesNotMatch(omit.slice(0, 500), /\bflexoffers\b/i);
  assert.doesNotMatch(omit.slice(0, 500), /\bpartnerize\b/i);
});
