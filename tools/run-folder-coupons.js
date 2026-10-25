'use strict';

/**
 * Download Awin promotions/vouchers for one advertiser into
 * {provider}/{affiliateId}/{yyyy-mm-dd}.coupons.json
 *
 * Usage: node run-folder-coupons.js --args-env
 * Env A_SEARCH_FOLDER_COUPONS_ARGS JSON:
 *   { provider, affiliateId, bucket, publisherId, apibase?, awsProfile?, force?, dryRun? }
 * Token from env AWIN_ACCESS_TOKEN only (never on argv).
 * Prints one JSON line to stdout (no secrets).
 */

const ARGS_ENV = 'A_SEARCH_FOLDER_COUPONS_ARGS';
const TOKEN_ENV = 'AWIN_ACCESS_TOKEN';

function loadArgs(argv, env) {
  const mode = argv[2] || '';
  let raw = '';
  if (mode === '--args-env') {
    raw = env[ARGS_ENV] || '';
    try {
      delete env[ARGS_ENV];
      delete process.env[ARGS_ENV];
    } catch {
      /* ignore */
    }
  } else {
    raw = mode;
  }
  if (!raw) {
    const err = new Error('usage');
    err.code = 'usage';
    throw err;
  }
  return JSON.parse(raw);
}

async function fetchAllOffers(opts) {
  const {
    apibase,
    publisherId,
    advertiserId,
    accessToken,
    fetchImpl,
  } = opts;
  const base = String(apibase || 'https://api.awin.com').replace(/\/$/, '');
  const url = `${base}/publisher/${publisherId}/promotions?accessToken=${encodeURIComponent(accessToken)}`;
  const fetchFn = fetchImpl || fetch;
  const all = [];
  let page = 1;
  const pageSize = 200;
  for (;;) {
    const body = {
      filters: {
        advertiserIds: [Number(advertiserId)],
        membership: 'joined',
        status: 'active',
        type: 'all',
      },
      pagination: { page, pageSize },
    };
    const resp = await fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      const err = new Error(`promotions_http_${resp.status}`);
      err.code = 'promotions_http';
      err.status = resp.status;
      err.body = text.slice(0, 200);
      throw err;
    }
    const json = await resp.json();
    const chunk = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    all.push(...chunk);
    const totalPages = Number(json?.pagination?.totalPages || json?.pagination?.pageCount || 0);
    if (!chunk.length || (totalPages && page >= totalPages) || chunk.length < pageSize) {
      break;
    }
    page += 1;
    if (page > 50) break;
  }
  return all;
}

async function main(argv) {
  let args;
  try {
    args = loadArgs(argv, process.env);
  } catch (err) {
    process.stderr.write('usage: run-folder-coupons.js --args-env\n');
    process.exit(2);
  }

  const provider = String(args.provider || '');
  const affiliateId = String(args.affiliateId || '');
  const bucket = args.bucket || process.env.A_AFFILIATES_BUCKET || 'a-affiliates';
  const publisherId = String(args.publisherId || '2889699');
  const apibase = args.apibase || 'https://api.awin.com';
  const force = Boolean(args.force);
  const dryRun = Boolean(args.dryRun);
  const region =
    args.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-2';
  const profile =
    args.awsProfile ||
    process.env.A_SEARCH_AGENTS_AWS_PROFILE ||
    process.env.AWS_PROFILE ||
    'a-search-redqueen-agents';

  const accessToken = String(process.env[TOKEN_ENV] || '').trim();
  try {
    delete process.env[TOKEN_ENV];
  } catch {
    /* ignore */
  }

  const day = new Date().toISOString().slice(0, 10);
  const key = `${provider}/${affiliateId}/${day}.coupons.json`;

  if (!provider || !affiliateId) {
    process.stdout.write(
      JSON.stringify({ ok: false, status: 'bad_args', key, count: 0 }) + '\n',
    );
    process.exit(1);
  }

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        status: 'dry_run',
        provider,
        affiliateId,
        key,
        count: null,
        apitokenSet: Boolean(accessToken),
      }) + '\n',
    );
    return;
  }

  if (!accessToken) {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        status: 'needs_apitoken',
        provider,
        affiliateId,
        key,
        count: 0,
      }) + '\n',
    );
    process.exit(2);
  }

  if (profile) {
    process.env.AWS_PROFILE = String(profile);
  }

  const {
    S3Client,
    HeadObjectCommand,
    PutObjectCommand,
  } = require('@aws-sdk/client-s3');
  const s3 = new S3Client({ region });

  if (!force) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      process.stdout.write(
        JSON.stringify({
          ok: true,
          status: 'exists',
          skipped: true,
          provider,
          affiliateId,
          key,
          count: null,
        }) + '\n',
      );
      return;
    } catch (err) {
      const code = err && (err.name || err.code || '');
      const status = err && err.$metadata && err.$metadata.httpStatusCode;
      if (code !== 'NotFound' && code !== 'NoSuchKey' && status !== 404) throw err;
    }
  }

  let offers;
  try {
    offers = await fetchAllOffers({
      apibase,
      publisherId,
      advertiserId: affiliateId,
      accessToken,
    });
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        status: err.code || 'promotions_failed',
        httpStatus: err.status || null,
        provider,
        affiliateId,
        key,
        count: 0,
      }) + '\n',
    );
    process.exit(1);
  }

  const payload = {
    provider,
    affiliateId,
    publisherId,
    downloadedAt: new Date().toISOString(),
    count: offers.length,
    offers,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json; charset=utf-8',
      ServerSideEncryption: 'AES256',
    }),
  );

  process.stdout.write(
    JSON.stringify({
      ok: true,
      status: 'ok',
      provider,
      affiliateId,
      key,
      count: offers.length,
      size: body.length,
    }) + '\n',
  );
}

main(process.argv).catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
