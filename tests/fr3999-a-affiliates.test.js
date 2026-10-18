'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const {
  assertSlug,
  providerMarkerKey,
  affiliateMarkerKey,
  providerJsonKey,
  partsDatedKey,
  partsLatestKey,
  partsPrefix,
  extFromMeta,
} = require('../shared/affiliates/keys');
const {
  normalizeProviderMeta,
  normalizeAffiliateMeta,
  mergeAffiliateMeta,
  redactForLog,
  FORBIDDEN_AFFILIATE_KEYS,
} = require('../shared/affiliates/metadata');
const {
  pickDatedPartsKeysToDelete,
} = require('../shared/affiliates/retention');
const { createMemoryS3 } = require('../affiliates/src/memoryS3');
const { downloadOne } = require('../affiliates/src/downloadOne');
const { runWeekly } = require('../affiliates/src/runWeekly');

const ROOT = path.join(__dirname, '..');
const BUCKET = 'a-affiliates';
const FAKE_PASSWORD = 'FAKE_password_example_only';
const FAKE_TOKEN = 'FAKE_apitoken_example_only';

describe('FR #3999 key layout / slug validation', () => {
  it('builds marker and parts keys', () => {
    assert.equal(providerMarkerKey('Awin'), 'awin/');
    assert.equal(affiliateMarkerKey('awin', 'Adv-1'), 'awin/adv-1/');
    assert.equal(providerJsonKey('awin'), 'awin/provider.json');
    assert.equal(
      partsDatedKey('awin', 'adv-1', '2026-10-18', 'csv.gz'),
      'awin/adv-1/parts/2026-10-18.csv.gz',
    );
    assert.equal(
      partsLatestKey('awin', 'adv-1', 'csv.gz'),
      'awin/adv-1/parts/latest.csv.gz',
    );
    assert.equal(partsPrefix('awin', 'adv-1'), 'awin/adv-1/parts/');
  });

  it('rejects unsafe slugs', () => {
    assert.throws(() => assertSlug('../x', 'provider'), /invalid_provider/);
    assert.throws(() => assertSlug('Has Space', 'affiliateid'), /invalid_affiliateid/);
    assert.throws(() => assertSlug('', 'provider'), /invalid_provider/);
  });

  it('extFromMeta maps format+compression', () => {
    assert.equal(extFromMeta({ format: 'csv', compression: 'gzip' }), 'csv.gz');
    assert.equal(extFromMeta({ format: 'xml', compression: 'none' }), 'xml');
    assert.equal(extFromMeta({ format: 'json', compression: 'zip' }), 'json.zip');
  });
});

describe('FR #3999 metadata normalize + redact', () => {
  it('normalizes provider meta and forbids stripe on affiliate', () => {
    const p = normalizeProviderMeta({
      name: 'Awin',
      authtype: 'TOKEN',
      password: FAKE_PASSWORD,
      apitoken: FAKE_TOKEN,
    });
    assert.equal(p.authtype, 'token');
    assert.equal(p.password, FAKE_PASSWORD);
    assert.ok(p.lastmod);

    assert.throws(
      () =>
        normalizeAffiliateMeta({
          affiliateid: 'a1',
          feedurl: 'https://example.com/feed.csv',
          stripeaccountid: 'acct_EXAMPLE',
        }),
      /stripe_fields_forbidden/,
    );
    for (const k of FORBIDDEN_AFFILIATE_KEYS) {
      assert.equal(typeof k, 'string');
    }
  });

  it('mergeAffiliateMeta preserves other keys and strips stripe', () => {
    const merged = mergeAffiliateMeta(
      {
        affiliateid: 'adv-1',
        name: 'Keep Me',
        feedurl: 'https://example.com/feed.csv',
        format: 'csv',
        enabled: '1',
        customnote: 'stay',
      },
      {
        laststatus: 'ok',
        lastsize: '12',
        stripeaccountid: 'acct_SHOULD_STRIP',
      },
      { now: new Date('2026-10-18T12:00:00.000Z') },
    );
    assert.equal(merged.name, 'Keep Me');
    assert.equal(merged.customnote, 'stay');
    assert.equal(merged.laststatus, 'ok');
    assert.equal(merged.lastsize, '12');
    assert.equal(merged.stripeaccountid, undefined);
    assert.equal(merged.lastmod, '2026-10-18T12:00:00.000Z');
  });

  it('redactForLog never contains password/apitoken values', () => {
    const red = redactForLog({
      name: 'Awin',
      username: 'FAKE_user',
      password: FAKE_PASSWORD,
      apitoken: FAKE_TOKEN,
      loginurl: 'https://example.com/login',
    });
    const blob = JSON.stringify(red);
    assert.equal(blob.includes(FAKE_PASSWORD), false);
    assert.equal(blob.includes(FAKE_TOKEN), false);
    assert.equal(red.password, '[REDACTED]');
    assert.equal(red.apitoken, '[REDACTED]');
    assert.equal(red.username, '[REDACTED]');
    assert.equal(red.name, 'Awin');
  });
});

describe('FR #3999 retention', () => {
  it('keeps last 4 dated parts keys', () => {
    const keys = [
      'awin/a1/parts/2026-09-01.csv',
      'awin/a1/parts/2026-09-08.csv',
      'awin/a1/parts/2026-09-15.csv',
      'awin/a1/parts/2026-09-22.csv',
      'awin/a1/parts/2026-09-29.csv',
      'awin/a1/parts/latest.csv',
      'awin/a1/parts/notes.txt',
    ];
    const del = pickDatedPartsKeysToDelete(keys, { keep: 4 });
    assert.deepEqual(del, ['awin/a1/parts/2026-09-01.csv']);
    assert.equal(del.includes('awin/a1/parts/latest.csv'), false);
  });
});

describe('FR #3999 / #4195 daily download (flat decompressed feed)', () => {
  it('gzip feed download writes decompressed flat key + lastok', async () => {
    const s3 = createMemoryS3();
    const plain = Buffer.from('sku,price\n1,2\n', 'utf8');
    const gz = zlib.gzipSync(plain);
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/',
      Body: Buffer.alloc(0),
      Metadata: normalizeProviderMeta({
        name: 'Awin',
        authtype: 'token',
        apitoken: FAKE_TOKEN,
      }),
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'awin/shop1/',
      Body: Buffer.alloc(0),
      Metadata: {
        ...normalizeAffiliateMeta({
          affiliateid: 'shop1',
          name: 'Shop One',
          feedurl: 'https://example.invalid/feed.csv.gz',
          format: 'csv',
          compression: 'gzip',
          enabled: '1',
        }),
        extrakey: 'preserve-me',
      },
    });

    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      body: gz,
    });

    const now = new Date('2026-10-18T15:00:00.000Z');
    const r = await downloadOne({
      s3,
      bucket: BUCKET,
      provider: 'awin',
      affiliateId: 'shop1',
      fetchImpl,
      now,
    });
    assert.equal(r.ok, true);
    assert.equal(r.size, plain.length);
    assert.equal(r.key, 'awin/shop1/2026-10-18.csv');

    const dated = await s3.getObject({
      Key: 'awin/shop1/2026-10-18.csv',
    });
    assert.deepEqual(dated.Body, plain);
    assert.equal(s3.objects.has('awin/shop1/parts/latest.csv.gz'), false);
    assert.equal(s3.objects.has('awin/shop1/parts/2026-10-18.csv.gz'), false);

    const head = await s3.headObject({ Key: 'awin/shop1/' });
    assert.equal(head.Metadata.laststatus, 'ok');
    assert.equal(head.Metadata.lastsize, String(plain.length));
    assert.equal(head.Metadata.lastok, now.toISOString());
    assert.equal(head.Metadata.extrakey, 'preserve-me');
    assert.equal(head.Metadata.name, 'Shop One');
  });

  it('one failing affiliate does not stop others', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'impact/',
      Body: Buffer.alloc(0),
      Metadata: { name: 'Impact' },
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'impact/good/',
      Body: Buffer.alloc(0),
      Metadata: normalizeAffiliateMeta({
        affiliateid: 'good',
        feedurl: 'https://example.invalid/good.csv',
        format: 'csv',
        enabled: '1',
      }),
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'impact/bad/',
      Body: Buffer.alloc(0),
      Metadata: normalizeAffiliateMeta({
        affiliateid: 'bad',
        feedurl: 'https://example.invalid/bad.csv',
        format: 'csv',
        enabled: '1',
      }),
    });

    const fetchImpl = async (url) => {
      if (String(url).includes('bad')) {
        return { ok: false, status: 500 };
      }
      return {
        ok: true,
        status: 200,
        body: Buffer.from('a,b\n1,2\n', 'utf8'),
      };
    };

    const logs = [];
    const summary = await runWeekly({
      s3,
      bucket: BUCKET,
      fetchImpl,
      now: new Date('2026-10-18T16:00:00.000Z'),
      log: (m) => logs.push(String(m)),
    });

    assert.equal(summary.ok, 1);
    assert.equal(summary.failed, 1);
    assert.ok(s3.objects.has('impact/good/2026-10-18.csv'));
    assert.equal(s3.objects.has('impact/bad/2026-10-18.csv'), false);

    const badHead = await s3.headObject({ Key: 'impact/bad/' });
    assert.equal(badHead.Metadata.laststatus, 'http_500');
    assert.equal(badHead.Metadata.lastok, undefined);

    const logBlob = logs.join('\n');
    assert.match(logBlob, /affiliate bad/);
    assert.match(logBlob, /affiliate good/);
    assert.equal(logBlob.includes(FAKE_PASSWORD), false);
    assert.equal(logBlob.includes(FAKE_TOKEN), false);
    assert.equal(/https:\/\/example\.invalid\/bad\.csv/.test(logBlob), false);
  });

  it('download leaves older dated feeds (no retention delete)', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'cj/',
      Body: Buffer.alloc(0),
      Metadata: { name: 'CJ' },
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'cj/x/',
      Body: Buffer.alloc(0),
      Metadata: normalizeAffiliateMeta({
        affiliateid: 'x',
        feedurl: 'https://example.invalid/x.csv',
        format: 'csv',
        enabled: '1',
      }),
    });
    await s3.putObject({
      Bucket: BUCKET,
      Key: 'cj/x/2026-09-01.csv',
      Body: Buffer.from('old', 'utf8'),
    });

    await downloadOne({
      s3,
      bucket: BUCKET,
      provider: 'cj',
      affiliateId: 'x',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        body: Buffer.from('new', 'utf8'),
      }),
      now: new Date('2026-10-18T17:00:00.000Z'),
    });

    assert.ok(s3.objects.has('cj/x/2026-09-01.csv'));
    assert.ok(s3.objects.has('cj/x/2026-10-18.csv'));
    assert.equal(s3.objects.has('cj/x/parts/latest.csv'), false);
  });
});

describe('FR #3999 CDK source pins (no aws-cdk-lib runtime)', () => {
  it('stack pins bucket, BlockPublicAccess, SSE, daily rule, no ASearchStack', () => {
    const stackPath = path.join(ROOT, 'cdk', 'lib', 'affiliates-stack.js');
    const binPath = path.join(ROOT, 'cdk', 'bin', 'affiliates.js');
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

    assert.match(stack, /a-affiliates/);
    assert.match(stack, /BlockPublicAccess\.BLOCK_ALL/);
    assert.match(stack, /BucketEncryption\.S3_MANAGED/);
    assert.match(stack, /enforceSSL:\s*true/);
    assert.match(stack, /RemovalPolicy\.RETAIN/);
    assert.match(stack, /autoDeleteObjects:\s*false/);
    assert.match(stack, /Schedule\.rate\(cdk\.Duration\.days\(1\)\)/);
    assert.match(stack, /NODEJS_20_X/);
    assert.match(stack, /s3:DeleteObject/);
    assert.match(bin, /AAffiliates/);
    assert.match(bin, /resolveDeployEnv/);
  });

  it('shared package.json files includes affiliates/', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(pkg.files.includes('affiliates/'));
  });

  it('root scripts include stage/synth/deploy affiliates', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
    );
    assert.equal(pkg.scripts['stage-affiliates'], 'node scripts/stage-affiliates-lambda-asset.js');
    assert.match(pkg.scripts['synth:affiliates'], /affiliates\.js/);
    assert.match(pkg.scripts['deploy:affiliates'], /AAffiliates/);
  });

  it('docs cover layout and metadata keys', () => {
    const doc = fs.readFileSync(path.join(ROOT, 'docs', 'a-affiliates.md'), 'utf8');
    assert.match(doc, /a-affiliates/);
    assert.match(doc, /loginurl/);
    assert.match(doc, /apitoken/);
    assert.match(doc, /feedurl/);
    assert.match(doc, /stripeaccountid/);
    assert.match(doc, /Lambda/);
    assert.match(doc, /Fargate/);
    assert.match(doc, /yyyy-mm-dd/);
    assert.match(doc, /refreshdays|lastok/);
    assert.match(doc, /rate\(1 day\)/);
    const deploy = fs.readFileSync(path.join(ROOT, 'docs', 'deploy.md'), 'utf8');
    assert.match(deploy, /AAffiliates/);
  });
});
