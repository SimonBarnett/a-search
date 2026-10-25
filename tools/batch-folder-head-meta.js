'use strict';

/**
 * Batch head-object for affiliate due-check (enabled / lastdownload / defaultage).
 * Usage:
 *   node tools/batch-folder-head-meta.js --args-env
 * Env A_SEARCH_BATCH_HEAD_ARGS JSON:
 *   { bucket, keys: ["awin/123/","awin/456/",...], awsProfile?, region?, concurrency? }
 * Prints one JSON line: { ok:true, results:[{ key, metadata:{...} }, ...] }
 * No secrets in output (user metadata values that look like secrets are left as-is for
 * the caller; selection only reads enabled/lastdownload/defaultage).
 */

const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');

const ARGS_ENV = 'A_SEARCH_BATCH_HEAD_ARGS';

function loadArgs(argv, env) {
  const e = env || process.env;
  const mode = argv[2] || '';
  let raw = '';
  if (mode === '--args-env') {
    raw = e[ARGS_ENV] || '';
    try {
      delete e[ARGS_ENV];
    } catch {
      /* ignore */
    }
    if (typeof process !== 'undefined' && process.env && e === process.env) {
      try {
        delete process.env[ARGS_ENV];
      } catch {
        /* ignore */
      }
    }
  } else {
    raw = argv[2] || '';
  }
  if (!raw) {
    throw new Error('missing_args');
  }
  return JSON.parse(raw);
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function main() {
  const args = loadArgs(process.argv, process.env);
  const bucket = String(args.bucket || 'a-affiliates');
  const keys = Array.isArray(args.keys) ? args.keys.map(String) : [];
  const region = String(args.region || process.env.AWS_REGION || 'eu-west-2');
  const concurrency = Math.max(1, Math.min(32, Number(args.concurrency) || 16));
  const profile =
    args.awsProfile ||
    process.env.A_SEARCH_AGENTS_AWS_PROFILE ||
    process.env.AWS_PROFILE ||
    'a-search-redqueen-agents';

  if (!keys.length) {
    process.stdout.write(JSON.stringify({ ok: true, results: [] }) + '\n');
    return;
  }

  // Same pattern as run-folder-coupons: set AWS_PROFILE, default credential chain.
  process.env.AWS_PROFILE = String(profile);
  const client = new S3Client({ region });

  const results = await mapPool(keys, concurrency, async (key) => {
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      const metadata = {};
      for (const [k, v] of Object.entries(head.Metadata || {})) {
        metadata[String(k).toLowerCase()] = String(v ?? '');
      }
      return { key, ok: true, metadata };
    } catch (e) {
      const status = e && e.$metadata && e.$metadata.httpStatusCode;
      return {
        key,
        ok: false,
        error: String((e && e.name) || 'head_failed'),
        status: status || null,
        metadata: {},
      };
    }
  });

  process.stdout.write(JSON.stringify({ ok: true, count: results.length, results }) + '\n');
}

main().catch((e) => {
  process.stderr.write(String((e && e.message) || e) + '\n');
  process.stdout.write(
    JSON.stringify({ ok: false, error: String((e && e.message) || e) }) + '\n',
  );
  process.exit(1);
});
