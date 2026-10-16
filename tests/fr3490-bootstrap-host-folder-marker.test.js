'use strict';

/**
 * FR #3490: first host sight with an injected S3 client also puts the
 * zero-byte folder marker. The FR-197 {env}/x/{customerNumber}/ tree stays.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bootstrapHost } = require('../shared/widgets/bootstrap');

describe('FR #3490 bootstrapHost folder marker', () => {
  it('local-only first sight stays synchronous and writes _host.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3490-'));
    const result = bootstrapHost({
      root,
      env: 'sandbox',
      customerNumber: '42',
      host: 'shop.example',
    });
    assert.equal(typeof result.then, 'undefined');
    assert.equal(result.created, true);
    const hostJson = path.join(root, 'sandbox', 'x', '42', '_host.json');
    assert.equal(fs.existsSync(hostJson), true);
    assert.equal(fs.existsSync(path.join(root, 'shop.example')), false);
  });

  it('injected s3 client puts the zero-byte marker on the customerNumber key', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3490-'));
    const puts = [];
    const heads = [];
    let exists = false;
    const s3 = {
      putObject: async (input) => {
        puts.push(input);
        exists = true;
      },
      headObject: async (input) => {
        heads.push(input);
        if (!exists) {
          const err = new Error('missing');
          err.name = 'NotFound';
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return { ContentLength: 0 };
      },
    };

    const first = await bootstrapHost({
      root,
      env: 'sandbox',
      customerNumber: '42',
      host: 'shop.example',
      userId: 'user-9',
      hasdns: 0,
      partnerid: 'p-1',
      hasupg: 0,
      s3,
    });
    assert.equal(first.created, true);
    assert.equal(first.marker.created, true);
    assert.equal(first.marker.key, 'sandbox/x/42/');
    assert.equal(puts.length, 1);
    assert.equal(puts[0].ContentLength, 0);
    assert.equal(puts[0].Body.length, 0);
    assert.equal(puts[0].Metadata.userid, 'user-9');
    assert.match(String(puts[0].Tagging), /hasdns=0/);
    assert.match(String(puts[0].Tagging), /partnerid=p-1/);
    assert.match(String(puts[0].Tagging), /hasupg=0/);
    assert.equal(
      fs.existsSync(path.join(root, 'sandbox', 'x', '42', '_host.json')),
      true,
    );

    const second = await bootstrapHost({
      root,
      env: 'sandbox',
      customerNumber: '42',
      host: 'shop.example',
      userId: 'user-9',
      s3,
    });
    assert.equal(second.created, false);
    assert.equal(second.marker.created, false);
    assert.equal(puts.length, 1);
    assert.equal(heads.length, 2);
  });
});
