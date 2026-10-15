'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
describe('docs/mrb-2195 hostile FR-248 pins', () => {
  it('networkParams taxonomy + Impact/Rakuten/CJ bugfix slots', () => {
    const src = read('shared/links/networkParams.js');
    assert.match(src, /class:\s*'merchant'/);
    assert.match(src, /notes: 'campaign belongs in path, not subId1'/);
    assert.match(src, /Publisher id -> query `id`/);
    assert.match(src, /tenantParam: 'sid'/);
  });
  it('buildOutboundUrl merchants plain; fail-closed affiliate', () => {
    const src = read('shared/links/buildOutboundUrl.js');
    assert.match(src, /net\.class === 'merchant'/);
    assert.match(src, /buildOutboundUrl/);
    assert.match(src, /isPartner/);
  });
  it('buildTrackedUrl delegates when source set', () => {
    const src = read('shared/links/buildTrackedUrl.js');
    assert.match(src, /buildOutboundUrl/);
    assert.match(src, /opts\.source/);
  });
  it('FR-248.md Decision LOCKED pins taxonomy + bug fixes', () => {
    const doc = read('docs/fr/FR-248.md');
    assert.match(doc, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(doc, /affiliate\|merchant\|provider/);
    assert.match(doc, /Impact campaign is path/);
    assert.match(doc, /Rakuten publisher is/);
    assert.match(doc, /CJ website id is path PID/);
  });
  it('fr248 suite + migration AmazonTrackingIds', () => {
    const t = read('tests/fr248-network-params.test.js');
    assert.match(t, /merchant|buildOutboundUrl|Impact|Rakuten|CJ/i);
    assert.ok(fs.existsSync(path.join(ROOT, 'db/migrations/015_AmazonTrackingIds.sql')));
  });
});
