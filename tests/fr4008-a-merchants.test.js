'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  assertSlug,
  providerMarkerKey,
  merchantMarkerKey,
  providerJsonKey,
  merchantJsonKey,
  agentMdKey,
  partsDatedKey,
  partsPrefix,
  extFromMeta,
} = require('../shared/merchants/keys');
const {
  normalizeProviderMeta,
  normalizeMerchantMeta,
  mergeMerchantMeta,
  redactForLog,
  METADATA_SOFT_MAX_BYTES,
} = require('../shared/merchants/metadata');
const {
  pickDatedPartsKeysToDelete,
} = require('../shared/merchants/retention');
const { createMemoryS3 } = require('../merchants/src/memoryS3');
const { downloadOne } = require('../merchants/src/downloadOne');
const { runWeekly } = require('../merchants/src/runWeekly');
const { onCreated } = require('../merchants/src/onCreated');

const ROOT = path.join(__dirname, '..');
const MERCHANTS_BUCKET = 'a-merchants';
const AFFILIATES_BUCKET = 'a-affiliates';
const FAKE_APIKEY = 'FAKE_apikey_example_only';
const FAKE_APISECRET = 'FAKE_apisecret_example_only';
const FAKE_ACCESSTOKEN = 'FAKE_accesstoken_example_only';
const FAKE_EMAIL = 'FAKE_merchant@example.invalid';

describe('FR #4008 key layout / slug validation', () => {
  it('builds marker, AGENT.md, merchant.json and parts keys', () => {
    assert.equal(providerMarkerKey('Shopify'), 'shopify/');
    assert.equal(merchantMarkerKey('shopify', 'My-Shop'), 'shopify/my-shop/');
    assert.equal(providerJsonKey('shopify'), 'shopify/provider.json');
    assert.equal(merchantJsonKey('shopify', 'my-shop'), 'shopify/my-shop/merchant.json');
    assert.equal(agentMdKey('shopify'), 'shopify/AGENT.md');
    assert.equal(
      partsDatedKey('shopify', 'my-shop', '2026-10-18', 'jsonl'),
      'shopify/my-shop/parts/2026-10-18.jsonl',
    );
    assert.equal(partsPrefix('shopify', 'my-shop'), 'shopify/my-shop/parts/');
  });

  it('rejects unsafe slugs', () => {
    assert.throws(() => assertSlug('../x', 'provider'), /invalid_provider/);
    assert.throws(() => assertSlug('Has Space', 'merchantid'), /invalid_merchantid/);
    assert.throws(() => assertSlug('', 'provider'), /invalid_provider/);
  });

  it('extFromMeta maps format', () => {
    assert.equal(extFromMeta({ format: 'jsonl' }), 'jsonl');
    assert.equal(extFromMeta({ format: 'json' }), 'json');
    assert.equal(extFromMeta({ format: 'csv' }), 'csv');
    assert.equal(extFromMeta({}), 'jsonl');
  });
});

describe('FR #4008 metadata normalize + redact + merge', () => {
  it('normalizes provider meta with AGENT.md instructions', () => {
    const p = normalizeProviderMeta({
      name: 'Shopify',
      apibase: 'https://example.myshopify.com/admin/api',
      apiversion: '2024-10',
      appclientid: 'FAKE_appclientid',
      instructions: 'AGENT.md',
    });
    assert.equal(p.name, 'Shopify');
    assert.equal(p.instructions, 'AGENT.md');
    assert.equal(p.apiversion, '2024-10');
    assert.ok(p.lastmod);
  });

  it('normalizes merchant meta including Stripe + secrets', () => {
    const m = normalizeMerchantMeta({
      merchantid: 'Shop-1',
      name: 'Shop One',
      apikey: FAKE_APIKEY,
      apisecret: FAKE_APISECRET,
      accesstoken: FAKE_ACCESSTOKEN,
      shopdomain: 'shop-one.myshopify.com',
      stripecustomerid: 'cus_FAKEEXAMPLE',
      stripesubscriptionid: 'sub_FAKEEXAMPLE',
      email: FAKE_EMAIL,
      format: 'JSONL',
      enabled: '1',
    });
    assert.equal(m.merchantid, 'shop-1');
    assert.equal(m.format, 'jsonl');
    assert.equal(m.apikey, FAKE_APIKEY);
    assert.equal(m.stripecustomerid, 'cus_FAKEEXAMPLE');
    assert.equal(m.email, FAKE_EMAIL);
    assert.ok(m.lastmod);
  });

  it('mergeMerchantMeta preserves other keys', () => {
    const merged = mergeMerchantMeta(
      {
        merchantid: 'shop-1',
        name: 'Keep Me',
        apikey: FAKE_APIKEY,
        shopdomain: 'keep.myshopify.com',
        email: FAKE_EMAIL,
        format: 'jsonl',
        enabled: '1',
        customnote: 'stay',
      },
      {
        laststatus: 'ok',
        lastsize: '12',
      },
      { now: new Date('2026-10-18T12:00:00.000Z') },
    );
    assert.equal(merged.name, 'Keep Me');
    assert.equal(merged.customnote, 'stay');
    assert.equal(merged.laststatus, 'ok');
    assert.equal(merged.apikey, FAKE_APIKEY);
    assert.equal(merged.lastmod, '2026-10-18T12:00:00.000Z');
  });

  it('redactForLog never contains API secrets or email', () => {
    const red = redactForLog({
      name: 'Shop',
      apikey: FAKE_APIKEY,
      apisecret: FAKE_APISECRET,
      accesstoken: FAKE_ACCESSTOKEN,
      email: FAKE_EMAIL,
      shopdomain: 'shop.myshopify.com',
    });
    const blob = JSON.stringify(red);
    assert.equal(blob.includes(FAKE_APIKEY), false);
    assert.equal(blob.includes(FAKE_APISECRET), false);
    assert.equal(blob.includes(FAKE_ACCESSTOKEN), false);
    assert.equal(blob.includes(FAKE_EMAIL), false);
    assert.equal(red.apikey, '[REDACTED]');
    assert.equal(red.apisecret, '[REDACTED]');
    assert.equal(red.accesstoken, '[REDACTED]');
    assert.equal(red.email, '[REDACTED]');
    assert.equal(red.name, 'Shop');
  });

  it('exposes soft 2KB metadata limit constant', () => {
    assert.equal(METADATA_SOFT_MAX_BYTES, 2048);
  });
});

describe('FR #4008 retention', () => {
  it('keeps last 4 dated parts keys', () => {
    const keys = [
      'shopify/a1/parts/2026-09-01.jsonl',
      'shopify/a1/parts/2026-09-08.jsonl',
      'shopify/a1/parts/2026-09-15.jsonl',
      'shopify/a1/parts/2026-09-22.jsonl',
      'shopify/a1/parts/2026-09-29.jsonl',
      'shopify/a1/parts/notes.txt',
    ];
    const del = pickDatedPartsKeysToDelete(keys, { keep: 4 });
    assert.deepEqual(del, ['shopify/a1/parts/2026-09-01.jsonl']);
  });
});

describe('FR #4008 marker create -> immediate download', () => {
  it('onCreated downloads one merchant when marker is created', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: MERCHANTS_BUCKET,
      Key: 'shopify/',
      Body: Buffer.alloc(0),
      Metadata: normalizeProviderMeta({
        name: 'Shopify',
        apibase: 'https://admin.example.invalid',
        apiversion: '2024-10',
        instructions: 'AGENT.md',
      }),
    });
    await s3.putObject({
      Bucket: MERCHANTS_BUCKET,
      Key: 'shopify/shop1/',
      Body: Buffer.alloc(0),
      Metadata: normalizeMerchantMeta({
        merchantid: 'shop1',
        name: 'Shop One',
        accesstoken: FAKE_ACCESSTOKEN,
        shopdomain: 'shop1.myshopify.com',
        email: FAKE_EMAIL,
        format: 'jsonl',
        enabled: '1',
      }),
    });

    const products = {
      products: [
        { id: 1, title: 'Widget', variants: [{ id: 10, sku: 'W1', price: '9.99' }] },
      ],
    };
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: Buffer.from(JSON.stringify(products), 'utf8'),
      json: async () => products,
    });

    const event = {
      Records: [
        {
          eventSource: 'aws:s3',
          eventName: 'ObjectCreated:Put',
          s3: {
            bucket: { name: MERCHANTS_BUCKET },
            object: { key: 'shopify/shop1/' },
          },
        },
      ],
    };

    const now = new Date('2026-10-18T15:00:00.000Z');
    const result = await onCreated(event, {
      s3,
      bucket: MERCHANTS_BUCKET,
      fetchImpl,
      now,
    });

    assert.equal(result.processed, 1);
    assert.equal(result.results[0].ok, true);
    assert.ok(s3.objects.has('shopify/shop1/parts/2026-10-18.jsonl'));
    const head = await s3.headObject({ Key: 'shopify/shop1/' });
    assert.equal(head.Metadata.laststatus, 'ok');
  });
});

describe('FR #4008 weekly both buckets + failure isolation + no overwrite', () => {
  it('weekly downloads enabled merchants and affiliates', async () => {
    const s3 = createMemoryS3();

    await s3.putObject({
      Bucket: MERCHANTS_BUCKET,
      Key: 'shopify/',
      Body: Buffer.alloc(0),
      Metadata: { name: 'Shopify' },
    });
    await s3.putObject({
      Bucket: MERCHANTS_BUCKET,
      Key: 'shopify/m1/',
      Body: Buffer.alloc(0),
      Metadata: normalizeMerchantMeta({
        merchantid: 'm1',
        name: 'M1',
        accesstoken: FAKE_ACCESSTOKEN,
        shopdomain: 'm1.myshopify.com',
        email: FAKE_EMAIL,
        format: 'jsonl',
        enabled: '1',
      }),
    });

    await s3.putObject({
      Bucket: AFFILIATES_BUCKET,
      Key: 'awin/',
      Body: Buffer.alloc(0),
      Metadata: { name: 'Awin' },
    });
    await s3.putObject({
      Bucket: AFFILIATES_BUCKET,
      Key: 'awin/a1/',
      Body: Buffer.alloc(0),
      Metadata: {
        affiliateid: 'a1',
        name: 'Aff One',
        feedurl: 'https://example.invalid/feed.csv',
        format: 'csv',
        compression: 'none',
        enabled: '1',
      },
    });

    const fetchImpl = async (url) => {
      const u = String(url);
      if (u.includes('feed.csv')) {
        return { ok: true, status: 200, body: Buffer.from('sku,price\n1,2\n', 'utf8') };
      }
      const products = { products: [{ id: 2, title: 'Part', variants: [] }] };
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: Buffer.from(JSON.stringify(products), 'utf8'),
        json: async () => products,
      };
    };

    const now = new Date('2026-10-18T16:00:00.000Z');
    const summary = await runWeekly({
      s3,
      merchantsBucket: MERCHANTS_BUCKET,
      affiliatesBucket: AFFILIATES_BUCKET,
      fetchImpl,
      now,
    });

    assert.ok(summary.merchants.ok >= 1);
    assert.ok(summary.affiliates.ok >= 1);
    assert.ok(s3.objects.has('shopify/m1/parts/2026-10-18.jsonl'));
    assert.ok(s3.objects.has('awin/a1/parts/2026-10-18.csv'));
  });

  it('does not overwrite existing unprocessed parts for that day', async () => {
    const s3 = createMemoryS3();
    const existing = Buffer.from('EXISTING_UNPROCESSED\n', 'utf8');
    await s3.putObject({
      Bucket: MERCHANTS_BUCKET,
      Key: 'shopify/',
      Body: Buffer.alloc(0),
      Metadata: { name: 'Shopify' },
    });
    await s3.putObject({
      Bucket: MERCHANTS_BUCKET,
      Key: 'shopify/m2/',
      Body: Buffer.alloc(0),
      Metadata: normalizeMerchantMeta({
        merchantid: 'm2',
        accesstoken: FAKE_ACCESSTOKEN,
        shopdomain: 'm2.myshopify.com',
        email: FAKE_EMAIL,
        format: 'jsonl',
        enabled: '1',
      }),
    });
    await s3.putObject({
      Bucket: MERCHANTS_BUCKET,
      Key: 'shopify/m2/parts/2026-10-18.jsonl',
      Body: existing,
    });

    const r = await downloadOne({
      s3,
      bucket: MERCHANTS_BUCKET,
      provider: 'shopify',
      merchantId: 'm2',
      fetchImpl: async () => {
        throw new Error('should_not_fetch');
      },
      now: new Date('2026-10-18T17:00:00.000Z'),
    });

    assert.equal(r.ok, false);
    assert.equal(r.status, 'parts_exists');
    const got = await s3.getObject({ Key: 'shopify/m2/parts/2026-10-18.jsonl' });
    assert.deepEqual(got.Body, existing);
    const head = await s3.headObject({ Key: 'shopify/m2/' });
    assert.equal(head.Metadata.laststatus, 'parts_exists');
  });

  it('one failing merchant does not stop others; logs have no secrets', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: MERCHANTS_BUCKET,
      Key: 'woo/',
      Body: Buffer.alloc(0),
      Metadata: { name: 'Woo' },
    });
    await s3.putObject({
      Bucket: MERCHANTS_BUCKET,
      Key: 'woo/good/',
      Body: Buffer.alloc(0),
      Metadata: normalizeMerchantMeta({
        merchantid: 'good',
        accesstoken: FAKE_ACCESSTOKEN,
        shopdomain: 'good.example.invalid',
        email: FAKE_EMAIL,
        format: 'jsonl',
        enabled: '1',
      }),
    });
    await s3.putObject({
      Bucket: MERCHANTS_BUCKET,
      Key: 'woo/bad/',
      Body: Buffer.alloc(0),
      Metadata: normalizeMerchantMeta({
        merchantid: 'bad',
        accesstoken: FAKE_ACCESSTOKEN,
        shopdomain: 'bad.example.invalid',
        email: FAKE_EMAIL,
        format: 'jsonl',
        enabled: '1',
      }),
    });

    const fetchImpl = async (url) => {
      if (String(url).includes('bad.example')) {
        return { ok: false, status: 500, headers: { get: () => null } };
      }
      const products = { products: [{ id: 9, title: 'Ok' }] };
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: Buffer.from(JSON.stringify(products), 'utf8'),
        json: async () => products,
      };
    };

    const logs = [];
    const summary = await runWeekly({
      s3,
      merchantsBucket: MERCHANTS_BUCKET,
      fetchImpl,
      now: new Date('2026-10-18T18:00:00.000Z'),
      log: (m) => logs.push(String(m)),
    });

    assert.equal(summary.merchants.ok, 1);
    assert.equal(summary.merchants.failed, 1);
    assert.ok(s3.objects.has('woo/good/parts/2026-10-18.jsonl'));
    assert.equal(s3.objects.has('woo/bad/parts/2026-10-18.jsonl'), false);

    const badHead = await s3.headObject({ Key: 'woo/bad/' });
    assert.equal(badHead.Metadata.laststatus, 'http_500');

    const logBlob = logs.join('\n');
    assert.match(logBlob, /merchant bad/);
    assert.match(logBlob, /merchant good/);
    assert.equal(logBlob.includes(FAKE_ACCESSTOKEN), false);
    assert.equal(logBlob.includes(FAKE_APIKEY), false);
    assert.equal(logBlob.includes(FAKE_EMAIL), false);
  });
});

describe('FR #4008 CDK source pins (no aws-cdk-lib runtime)', () => {
  it('stack pins isolated AMerchants bucket, hardening, weekly + onCreated, no ASearchStack', () => {
    const stackPath = path.join(ROOT, 'cdk', 'lib', 'merchants-stack.js');
    const binPath = path.join(ROOT, 'cdk', 'bin', 'merchants.js');
    assert.equal(fs.existsSync(stackPath), true);
    assert.equal(fs.existsSync(binPath), true);
    const stack = fs.readFileSync(stackPath, 'utf8');
    const bin = fs.readFileSync(binPath, 'utf8');

    assert.equal(stack.includes('ASearchStack'), false);
    assert.equal(bin.includes('ASearchStack'), false);
    assert.equal(/require\(.*a-search-stack/i.test(stack), false);
    assert.equal(/require\(.*parts-gateway-stack/i.test(stack), false);
    assert.equal(/a-clubs/.test(stack), false);
    assert.equal(/madeira/i.test(stack), false);

    assert.match(stack, /a-merchants/);
    assert.match(stack, /a-search-merchants/);
    assert.match(stack, /BlockPublicAccess\.BLOCK_ALL/);
    assert.match(stack, /BucketEncryption\.S3_MANAGED/);
    assert.match(stack, /enforceSSL:\s*true/);
    assert.match(stack, /RemovalPolicy\.RETAIN/);
    assert.match(stack, /autoDeleteObjects:\s*false/);
    assert.match(stack, /objectSizeGreaterThan:\s*0/);
    assert.match(stack, /Schedule\.rate\(cdk\.Duration\.days\(7\)\)/);
    assert.match(stack, /NODEJS_20_X/);
    assert.match(stack, /A_MERCHANTS_BUCKET/);
    assert.match(stack, /A_AFFILIATES_BUCKET/);
    assert.match(stack, /onCreated/);
    assert.match(stack, /ObjectCreated/);
    assert.match(bin, /AMerchants/);
    assert.match(bin, /resolveDeployEnv/);
  });

  it('shared package.json files includes merchants/', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(pkg.files.includes('merchants/'));
  });

  it('root scripts include stage/synth/deploy merchants', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
    );
    assert.equal(pkg.scripts['stage-merchants'], 'node scripts/stage-merchants-lambda-asset.js');
    assert.match(pkg.scripts['synth:merchants'], /merchants\.js/);
    assert.match(pkg.scripts['deploy:merchants'], /AMerchants/);
  });

  it('docs cover layout, AGENT.md template, Shopify example, dual-bucket weekly', () => {
    const doc = fs.readFileSync(path.join(ROOT, 'docs', 'a-merchants.md'), 'utf8');
    assert.match(doc, /a-merchants/);
    assert.match(doc, /a-search-merchants/);
    assert.match(doc, /AGENT\.md/);
    assert.match(doc, /stripecustomerid/);
    assert.match(doc, /accesstoken/);
    assert.match(doc, /Shopify/i);
    assert.match(doc, /A_AFFILIATES_BUCKET/);
    assert.match(doc, /ObjectCreated|on.creation|on-create/i);
    assert.match(doc, /ONE weekly Lambda|one weekly Lambda|single weekly/i);
    const deploy = fs.readFileSync(path.join(ROOT, 'docs', 'deploy.md'), 'utf8');
    assert.match(deploy, /AMerchants/);
  });
});
