'use strict';

/**
 * FR #5070: s3://a-affiliates code lives in git under affiliates/bucket/.
 * Every committed file must match the sha256 / size / ETag (MD5) recorded in
 * affiliates/MANIFEST.json at import time, and the tree must hold nothing else.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const bucketRoot = path.join(root, 'affiliates', 'bucket');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'affiliates', 'MANIFEST.json'), 'utf8'));

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile()) out.push(path.relative(bucketRoot, p).split(path.sep).join('/'));
  }
  return out;
}

describe('FR #5070 affiliates/bucket matches MANIFEST.json', () => {
  it('manifest is well formed', () => {
    assert.equal(manifest.source, 's3://a-affiliates/');
    assert.ok(Array.isArray(manifest.objects) && manifest.objects.length > 0);
    for (const o of manifest.objects) {
      assert.match(o.sha256, /^[0-9a-f]{64}$/, o.key);
      assert.match(o.etag, /^[0-9a-f]{32}$/, o.key);
      assert.ok(Number.isInteger(o.size) && o.size > 0, o.key);
    }
  });

  it('every manifest object is committed byte-for-byte', () => {
    for (const o of manifest.objects) {
      const buf = fs.readFileSync(path.join(bucketRoot, ...o.key.split('/')));
      assert.equal(buf.length, o.size, `${o.key} size`);
      assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), o.sha256, `${o.key} sha256`);
      assert.equal(crypto.createHash('md5').update(buf).digest('hex'), o.etag, `${o.key} etag`);
    }
  });

  it('tree has no files outside the manifest', () => {
    const keys = new Set(manifest.objects.map((o) => o.key));
    const extra = walk(bucketRoot).filter((k) => !keys.has(k));
    assert.deepEqual(extra, []);
  });

  it('no data, records or secret files were imported', () => {
    for (const o of manifest.objects) {
      assert.doesNotMatch(o.key, /^[^/]+\/\d+\//, `${o.key} is a merchant folder`);
      assert.doesNotMatch(o.key, /\/_(invites|applications)\//, `${o.key} is a record`);
      assert.doesNotMatch(o.key, /(^|\/)\.env|secret|password|\.pem$|\.key$/i, `${o.key} looks secret`);
    }
  });

  it('affiliates/bucket is binary-safe in .gitattributes (no EOL normalisation)', () => {
    const ga = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
    assert.match(ga, /^affiliates\/bucket\/\*\* -text$/m);
  });
});

describe('FR #5070 invite.ps1 reads optional config.json keys StrictMode-safely', () => {
  it('no bare `$cfg -and $cfg.<key>` guard (throws under Set-StrictMode when the key is absent)', () => {
    const text = fs.readFileSync(path.join(root, 'tools', 'invite.ps1'), 'utf8');
    assert.match(text, /function Test-InviteCfgValue/);
    assert.doesNotMatch(text, /if \(\$cfg -and \$cfg\.\w+\)/);
    assert.match(text, /Test-InviteCfgValue \$cfg 'reportDir'/);
  });
});
