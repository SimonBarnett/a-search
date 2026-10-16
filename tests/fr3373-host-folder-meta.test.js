'use strict';

/**
 * FR-3373 / #3373: host folder marker metadata, tags, annotations.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  ANNOTATION_MAX_BYTES,
  safeHostFolderName,
  hostFolderMarkerKey,
  hostAnnotationsKey,
  widgetAnnotationsKey,
  buildHostMetadata,
  buildHostTagSet,
  parseHostTagSet,
  ensureHostFolderMarker,
  putHostFolderTags,
  shouldSkipDnsCheck,
  putHostAnnotations,
  putWidgetAnnotations,
} = require('../shared/widgets/hostFolderMeta');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'fr', 'FR-3373.md');
const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('FR-3373 host folder metadata / tags / annotations', () => {
  it('safeHostFolderName is file-safe and rejects empty', () => {
    assert.equal(safeHostFolderName('WWW.Example.COM'), 'www.example.com');
    assert.equal(safeHostFolderName('shop.example.com/path'), 'shop.example.com');
    assert.equal(safeHostFolderName('a_b!.example'), 'a_b_.example');
    assert.throws(() => safeHostFolderName(''), /host is required/);
  });

  it('marker + annotation keys stay under customerNumber tree', () => {
    assert.equal(hostFolderMarkerKey('sandbox', 42), 'sandbox/x/42/');
    assert.equal(
      hostAnnotationsKey('live', '99'),
      'live/x/99/_host.annotations.json',
    );
    assert.equal(
      widgetAnnotationsKey('sandbox', '42', GUID),
      `sandbox/x/42/${GUID}/_annotations.json`,
    );
  });

  it('Metadata userid is required; tags default 0/empty', () => {
    const md = buildHostMetadata({
      userId: 'user-1',
      host: 'Shop.Example.com',
      customerNumber: '42',
    });
    assert.equal(md.userid, 'user-1');
    assert.equal(md.host, 'shop.example.com');
    assert.equal(md.hostkey, 'shop.example.com');
    assert.equal(md.customerNumber, '42');
    assert.throws(
      () => buildHostMetadata({ userId: '', host: 'a.com', customerNumber: '1' }),
      /userid_required/,
    );
    const tags = parseHostTagSet(buildHostTagSet({}));
    assert.equal(tags.hasdns, false);
    assert.equal(tags.partnerid, '');
    assert.equal(tags.hasupg, false);
    const t2 = parseHostTagSet(
      buildHostTagSet({ hasdns: 1, partnerid: 'P1', hasupg: true }),
    );
    assert.equal(t2.hasdns, true);
    assert.equal(t2.partnerid, 'P1');
    assert.equal(t2.hasupg, true);
  });

  it('ensureHostFolderMarker puts zero-byte object with Metadata; idempotent via head', async () => {
    /** @type {object[]} */
    const puts = [];
    const heads = [];
    const r1 = await ensureHostFolderMarker({
      env: 'sandbox',
      customerNumber: '7',
      host: 'host.example',
      userId: 'u9',
      hasdns: 0,
      putObject: async (input) => {
        puts.push(input);
      },
      headObject: async (input) => {
        heads.push(input);
        const err = new Error('missing');
        err.name = 'NotFound';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      },
    });
    assert.equal(r1.created, true);
    assert.equal(r1.key, 'sandbox/x/7/');
    assert.equal(puts.length, 1);
    assert.equal(puts[0].ContentLength, 0);
    assert.equal(puts[0].Metadata.userid, 'u9');
    assert.equal(puts[0].Metadata.hostkey, 'host.example');
    assert.match(String(puts[0].Tagging || ''), /hasdns=0/);

    const r2 = await ensureHostFolderMarker({
      env: 'sandbox',
      customerNumber: '7',
      host: 'host.example',
      userId: 'u9',
      putObject: async () => {
        throw new Error('must_not_put_again');
      },
      headObject: async () => ({ ContentLength: 0 }),
    });
    assert.equal(r2.created, false);
    assert.equal(heads.length, 1);
  });

  it('shouldSkipDnsCheck when hasdns=1; putHostFolderTags updates tags', async () => {
    let stored = [];
    await putHostFolderTags({
      env: 'live',
      customerNumber: '3',
      hasdns: 1,
      partnerid: 'partner-9',
      hasupg: 0,
      putObjectTagging: async (input) => {
        stored = input.Tagging.TagSet;
      },
    });
    assert.equal(parseHostTagSet(stored).hasdns, true);
    assert.equal(parseHostTagSet(stored).partnerid, 'partner-9');

    const skip = await shouldSkipDnsCheck({
      env: 'live',
      customerNumber: '3',
      getObjectTagging: async () => ({ TagSet: stored }),
    });
    assert.equal(skip, true);

    const noskip = await shouldSkipDnsCheck({
      env: 'live',
      customerNumber: '3',
      getObjectTagging: async () => ({
        TagSet: buildHostTagSet({ hasdns: 0 }),
      }),
    });
    assert.equal(noskip, false);
  });

  it('annotations cap at 1 MiB; host + widget keys', async () => {
    const puts = [];
    await putHostAnnotations({
      env: 'sandbox',
      customerNumber: '1',
      payload: { agent: 'site context' },
      putObject: async (input) => {
        puts.push(input);
      },
    });
    assert.equal(puts[0].Key, 'sandbox/x/1/_host.annotations.json');
    assert.ok(puts[0].bytes == null || puts[0].ContentLength > 0);

    await putWidgetAnnotations({
      env: 'sandbox',
      customerNumber: '1',
      widgetGuid: GUID,
      payload: { note: 'from extension' },
      putObject: async (input) => {
        puts.push(input);
      },
    });
    assert.equal(puts[1].Key, `sandbox/x/1/${GUID}/_annotations.json`);

    const huge = 'x'.repeat(ANNOTATION_MAX_BYTES + 1);
    await assert.rejects(
      () =>
        putHostAnnotations({
          env: 'sandbox',
          customerNumber: '1',
          payload: huge,
          putObject: async () => {},
        }),
      /annotation_too_large/,
    );
  });

  it('docs/fr/FR-3373.md Decision LOCKED ASCII no BOM', () => {
    const buf = fs.readFileSync(DOC);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /userid/);
    assert.match(text, /hasdns/);
    assert.match(text, /partnerid/);
    assert.match(text, /hasupg/);
    assert.match(text, /_host\.annotations\.json/);
    assert.match(text, /customerNumber/);
    assert.match(text, /FR-197/);
  });
});
