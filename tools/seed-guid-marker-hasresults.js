#!/usr/bin/env node
'use strict';

/**
 * FR #5142: seed missing hasresults=0 / enabled=0 on existing a-clubs GUID markers.
 *
 * CAST IRON: does not write unless --simon-go is passed (Simon must approve
 * a-clubs data backfill). Default is dry-run.
 *
 * Usage:
 *   node tools/seed-guid-marker-hasresults.js
 *   node tools/seed-guid-marker-hasresults.js --simon-go
 *   node tools/seed-guid-marker-hasresults.js --prefix www.example.com/
 */

const {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
} = require('@aws-sdk/client-s3');

function classifyGuidMarkerKey(key) {
  const k = String(key || '');
  const m = /^([^/]+)\/([0-9a-fA-F-]{36})\/$/.exec(k);
  if (!m) return null;
  return { hostkey: m[1], guid: m[2].toLowerCase(), key: k };
}

function parseArgs(argv) {
  const out = {
    simonGo: false,
    prefix: '',
    bucket: process.env.A_CLUBS_BUCKET || 'a-clubs',
    region: process.env.AWS_REGION || process.env.A_SEARCH_AWS_REGION || 'eu-west-2',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--simon-go') out.simonGo = true;
    else if (a === '--prefix') out.prefix = String(argv[++i] || '');
    else if (a === '--bucket') out.bucket = String(argv[++i] || out.bucket);
    else if (a === '--region') out.region = String(argv[++i] || out.region);
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(
      'seed-guid-marker-hasresults.js [--simon-go] [--prefix host/] [--bucket a-clubs]\n',
    );
    process.exit(0);
  }

  const client = new S3Client({ region: args.region, maxAttempts: 5 });
  let ContinuationToken;
  let scanned = 0;
  let wouldSeed = 0;
  let seeded = 0;

  do {
    const resp = await client.send(
      new ListObjectsV2Command({
        Bucket: args.bucket,
        Prefix: args.prefix || undefined,
        ContinuationToken,
      }),
    );
    for (const item of resp.Contents || []) {
      const classified = classifyGuidMarkerKey(item.Key);
      if (!classified) continue;
      scanned += 1;
      const head = await client.send(
        new HeadObjectCommand({ Bucket: args.bucket, Key: classified.key }),
      );
      const md = { ...(head.Metadata || {}) };
      const needHas =
        md.hasresults == null || String(md.hasresults).trim() === '';
      const needEn =
        md.enabled == null || String(md.enabled).trim() === '';
      if (!needHas && !needEn) continue;
      wouldSeed += 1;
      const next = { ...md };
      if (needHas) next.hasresults = '0';
      if (needEn) next.enabled = '0';
      process.stdout.write(
        `${args.simonGo ? 'SEED' : 'DRY'} ${classified.key} hasresults=${next.hasresults} enabled=${next.enabled}\n`,
      );
      if (!args.simonGo) continue;
      const encodedKey = classified.key
        .split('/')
        .map((p) => encodeURIComponent(p))
        .join('/');
      await client.send(
        new CopyObjectCommand({
          Bucket: args.bucket,
          Key: classified.key,
          CopySource: `${args.bucket}/${encodedKey}`,
          MetadataDirective: 'REPLACE',
          Metadata: next,
          TaggingDirective: 'COPY',
        }),
      );
      seeded += 1;
    }
    ContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (ContinuationToken);

  process.stdout.write(
    `scanned=${scanned} would_seed=${wouldSeed} seeded=${seeded} simon_go=${args.simonGo}\n`,
  );
  if (!args.simonGo && wouldSeed > 0) {
    process.stdout.write(
      'Refusing to write: pass --simon-go after Simon approves a-clubs backfill (FR #5142).\n',
    );
  }
}

main().catch((err) => {
  process.stderr.write(`${String((err && err.message) || err)}\n`);
  process.exit(1);
});
