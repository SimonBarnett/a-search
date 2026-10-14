'use strict';

/**
 * MRB #1426 hostile pin: FR-177 enable avantlink registry + credential keys + floors.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('mrb1426: avantlink enabled both envs; partnerize+bol kept; floors 2*enabled', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'providers/registry.json'), 'utf8'));
  const byId = new Map(reg.sources.map((s) => [s.id, s]));
  const al = byId.get('avantlink');
  assert.equal(al.enabled.live, true);
  assert.equal(al.enabled.sandbox, true);
  const pz = byId.get('partnerize');
  assert.equal(pz.enabled.live, true);
  assert.equal(pz.enabled.sandbox, true);
  const bol = byId.get('bol');
  assert.equal(bol.enabled.live, true);
  assert.equal(bol.enabled.sandbox, true);
  const td = byId.get('tradedoubler');
  assert.equal(td.enabled.live, true);
  assert.equal(td.enabled.sandbox, true);
  const enabled = reg.sources.filter((s) => s.enabled.live && s.enabled.sandbox).map((s) => s.id).sort();
  assert.ok(enabled.includes('avantlink'));
  assert.ok(enabled.includes('partnerize'));
  assert.ok(enabled.includes('bol'));
  assert.ok(enabled.includes('tradedoubler'));
  assert.ok(enabled.includes('shopify'));
  assert.ok(enabled.includes('webgains'));
  assert.equal(enabled.length * 2, 32);
});

test('mrb1426: CDK PROVIDER_CREDENTIAL_KEYS includes avantlink FR-138 names', () => {
  const stack = fs.readFileSync(path.join(ROOT, 'cdk/lib/a-search-stack.js'), 'utf8');
  assert.match(stack, /\bavantlink\s*:\s*\[/);
  assert.match(stack, /AVANTLINK_API_KEY/);
  assert.match(stack, /AVANTLINK_API_TOKEN/);
  assert.match(stack, /AVANTLINK_FEED_TOKEN/);
  assert.match(stack, /AVANTLINK_PUBLISHER_ID/);
  assert.match(stack, /AVANTLINK_AFFILIATE_ID/);
  assert.match(stack, /\bpartnerize\s*:\s*\[/);
  assert.match(stack, /\bbol\s*:\s*\[/);
  assert.match(stack, /BOL_API_KEY/);
  assert.match(stack, /\btradedoubler\s*:\s*\[/);
  assert.match(stack, /TRADEDOUBLER_API_KEY/);
  assert.equal(stack.includes('<<<<<<<'), false);
});

test('mrb1426: FR-177 Decision LOCKED; secrets-matrix has avantlink not stay-dark', () => {
  const fr = fs.readFileSync(path.join(ROOT, 'docs/fr/FR-177.md'));
  assert.notEqual(fr[0], 0xef);
  const frt = fr.toString('utf8');
  assert.match(frt, /Decision:\s*LOCKED|Decision.*LOCKED/i);
  const matrix = fs.readFileSync(path.join(ROOT, 'docs/secrets-matrix.md'), 'utf8');
  assert.match(matrix, /avantlink/i);
  assert.match(matrix, /AVANTLINK_API_KEY/);
  const omit = matrix.split(/Stay-dark omitted/i)[1] || '';
  assert.doesNotMatch(omit.slice(0, 400), /\bavantlink\b/i);
  assert.doesNotMatch(omit.slice(0, 400), /\bpartnerize\b/i);
  assert.doesNotMatch(omit.slice(0, 400), /\bbol\b/i);
  assert.doesNotMatch(omit.slice(0, 400), /\btradedoubler\b/i);
});
