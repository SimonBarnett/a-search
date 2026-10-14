'use strict';

/**
 * MRB #1426 hostile pin: FR-177 avantlink credential keys retained;
 * GBP/UK market hold (FR-255) keeps avantlink+bol disabled; floors 12x2=24.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('mrb1426: GBP hold - avantlink+bol disabled; partnerize+tradedoubler on; floors 24', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'providers/registry.json'), 'utf8'));
  const byId = new Map(reg.sources.map((s) => [s.id, s]));
  const al = byId.get('avantlink');
  assert.equal(al.enabled.live, false);
  assert.equal(al.enabled.sandbox, false);
  const bol = byId.get('bol');
  assert.equal(bol.enabled.live, false);
  assert.equal(bol.enabled.sandbox, false);
  const ae = byId.get('aliexpress');
  assert.equal(ae.enabled.live, false);
  assert.equal(ae.enabled.sandbox, false);
  const pz = byId.get('partnerize');
  assert.equal(pz.enabled.live, true);
  assert.equal(pz.enabled.sandbox, true);
  const td = byId.get('tradedoubler');
  assert.equal(td.enabled.live, true);
  assert.equal(td.enabled.sandbox, true);
  const enabled = reg.sources
    .filter((s) => s.enabled.live && s.enabled.sandbox)
    .map((s) => s.id)
    .sort();
  assert.equal(enabled.includes('avantlink'), false);
  assert.equal(enabled.includes('bol'), false);
  assert.equal(enabled.includes('aliexpress'), false);
  assert.ok(enabled.includes('partnerize'));
  assert.ok(enabled.includes('tradedoubler'));
  assert.ok(enabled.includes('shopify'));
  assert.equal(enabled.length, 12);
  assert.equal(enabled.length * 2, 24);
});

test('mrb1426: CDK PROVIDER_CREDENTIAL_KEYS still includes avantlink FR-138 names', () => {
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

test('mrb1426: FR-177 Decision LOCKED; secrets-matrix has avantlink; hold docs cite FR-255', () => {
  const fr = fs.readFileSync(path.join(ROOT, 'docs/fr/FR-177.md'));
  assert.notEqual(fr[0], 0xef);
  const frt = fr.toString('utf8');
  assert.match(frt, /Decision:\s*LOCKED|Decision.*LOCKED/i);
  const matrix = fs.readFileSync(path.join(ROOT, 'docs/secrets-matrix.md'), 'utf8');
  assert.match(matrix, /avantlink/i);
  assert.match(matrix, /AVANTLINK_API_KEY/);
  const hold = fs.readFileSync(
    path.join(ROOT, 'docs/feature-request-gbp-market-hold-2026-10-14.md'),
    'utf8',
  );
  assert.match(hold, /avantlink/i);
  assert.match(hold, /HOLD|hold/);
});
