'use strict';

/**
 * MRB #3391 hostile pins for FR-3373 / PR #3391 (S3 host folder Metadata/tags/annotations).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mod = require('../shared/widgets/hostFolderMeta');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'shared', 'widgets', 'hostFolderMeta.js'), 'utf8');
const FR = fs.readFileSync(path.join(__dirname, '..', 'docs', 'fr', 'FR-3373.md'), 'utf8');

describe('mrb3391 hostile FR-3373 host folder meta', () => {
  it('Decision LOCKED; physical tree stays customerNumber; TAG floors exported', () => {
    assert.match(FR, /Decision \(LOCKED\)/);
    assert.match(FR, /\{env\}\/x\/\{customerNumber\}\//);
    assert.equal(mod.ANNOTATION_MAX_BYTES, 1024 * 1024);
    assert.equal(mod.TAG_HASDNS, 'hasdns');
    assert.equal(mod.TAG_PARTNERID, 'partnerid');
    assert.equal(mod.TAG_HASUPG, 'hasupg');
    assert.equal(typeof mod.safeHostFolderName, 'function');
    assert.equal(typeof mod.ensureHostFolderMarker, 'function');
    assert.equal(typeof mod.shouldSkipDnsCheck, 'function');
  });

  it('safeHostFolderName + keys never embed path separators or raw URL scheme', () => {
    const key = mod.safeHostFolderName('Shop.Example.com');
    assert.equal(key.includes('/'), false);
    assert.equal(key.includes('\\'), false);
    assert.equal(key.includes(':'), false);
    assert.match(key, /^[a-z0-9._-]+$/);
    const marker = mod.hostFolderMarkerKey('sandbox', '42');
    assert.ok(marker.startsWith('sandbox/x/42/'));
    assert.equal(marker.includes('Shop.Example'), false);
    assert.equal(mod.hostAnnotationsKey('sandbox', '42'), 'sandbox/x/42/_host.annotations.json');
    const wid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    assert.equal(
      mod.widgetAnnotationsKey('sandbox', '42', wid),
      `sandbox/x/42/${wid}/_annotations.json`,
    );
  });

  it('Metadata userId -> userid + hostkey; tags 0|1; shouldSkipDnsCheck when hasdns=1', async () => {
    const meta = mod.buildHostMetadata({
      userId: 'u-1',
      host: 'shop.example',
      customerNumber: '42',
    });
    assert.equal(meta.userid, 'u-1');
    assert.equal(meta.hostkey, mod.safeHostFolderName('shop.example'));
    assert.equal(meta.customerNumber, '42');
    const parsed = mod.parseHostTagSet(mod.buildHostTagSet({}));
    assert.equal(parsed.hasdns, false);
    assert.equal(parsed.hasupg, false);
    assert.equal(parsed.partnerid, '');
    const skip = await mod.shouldSkipDnsCheck({
      getObjectTagging: async () => ({
        TagSet: [{ Key: 'hasdns', Value: '1' }],
      }),
      env: 'sandbox',
      customerNumber: '42',
    });
    assert.equal(skip, true);
  });

  it('source has no live AWS SDK require; annotation oversize throws annotation_too_large', async () => {
    assert.doesNotMatch(SRC, /require\(['"]@aws-sdk\//);
    assert.doesNotMatch(SRC, /AWS_SECRET|password\s*=/i);
    await assert.rejects(
      () =>
        mod.putHostAnnotations({
          env: 'sandbox',
          customerNumber: '42',
          payload: 'x'.repeat(mod.ANNOTATION_MAX_BYTES + 1),
          putObject: async () => {
            throw new Error('should_not_put');
          },
        }),
      (err) => err && err.code === 'annotation_too_large',
    );
  });
});
