'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

describe('MRB #5205 hostile: FR #5070 affiliates bucket import', () => {
  it('affiliates/README states git is source of truth', () => {
    const t = fs.readFileSync(path.join(ROOT, 'affiliates', 'README.md'), 'utf8');
    assert.ok(!t.startsWith('\ufeff'));
    assert.match(t, /Git is the source of truth/);
    assert.match(t, /Nobody should edit S3 directly/);
    assert.match(t, /MANIFEST\.json/);
    assert.match(t, /\.gitattributes.*affiliates\/bucket\/\*\*.*-text/s);
  });

  it('invite.ps1 uses Test-InviteCfgValue for optional keys', () => {
    const t = fs.readFileSync(path.join(ROOT, 'tools', 'invite.ps1'), 'utf8');
    assert.match(t, /function Test-InviteCfgValue/);
    assert.match(t, /FR #5070: StrictMode-safe optional/);
    assert.doesNotMatch(t, /if \(\$cfg -and \$cfg\.\w+\)/);
    assert.match(t, /Test-InviteCfgValue \$cfg 'reportDir'/);
  });

  it('MANIFEST records 39 imported objects and excludes data prefixes', () => {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'affiliates', 'MANIFEST.json'), 'utf8'));
    assert.equal(m.fr, 5070);
    assert.equal(m.objects.length, 39);
    for (const o of m.objects) {
      assert.ok(!/^awin\/\d+\//.test(o.key), o.key);
      assert.ok(!o.key.includes('_invites/'), o.key);
      assert.ok(!/\.env$/i.test(o.key), o.key);
    }
  });

  it('.gitattributes pins affiliates/bucket/** -text', () => {
    const ga = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
    assert.match(ga, /^affiliates\/bucket\/\*\* -text$/m);
  });
});