'use strict';

/**
 * Upsert one a-affiliates/{provider}/{id}/ marker from JSON args.
 * Args via env A_SEARCH_FOLDER_UPSERT_ARGS (WinPS-safe), same pattern as download.
 * Never logs secrets.
 */
const {
  upsertAwinAffiliateFolder,
} = require('../redqueen/awin-agent/src/folderUpsert');
const {
  mergeAffiliateMeta,
  coerceStringMap,
} = require('../shared/affiliates/metadata');
const { affiliateMarkerKey, assertSlug } = require('../shared/affiliates/keys');

async function main() {
  const raw = process.env.A_SEARCH_FOLDER_UPSERT_ARGS;
  if (!raw) {
    console.error('missing_args_env');
    process.exit(2);
  }
  const args = JSON.parse(raw);
  const bucket = args.bucket || 'a-affiliates';
  const provider = String(args.provider || 'awin');
  const id = assertSlug(String(args.affiliateId), 'affiliateid');
  const patch = coerceStringMap(args.patch || {});
  const dryRun = Boolean(args.dryRun);
  const now = args.now ? new Date(args.now) : new Date();

  // Minimal S3 client via AWS SDK v3 if available, else aws-cli spawn fallback is not used here.
  let S3Client;
  let HeadObjectCommand;
  let PutObjectCommand;
  let CopyObjectCommand;
  try {
    ({ S3Client, HeadObjectCommand, PutObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3'));
  } catch {
    // resolve from redqueen or repo root node_modules
    const path = require('node:path');
    const mod = require(path.join(__dirname, '..', 'node_modules', '@aws-sdk', 'client-s3'));
    S3Client = mod.S3Client;
    HeadObjectCommand = mod.HeadObjectCommand;
    PutObjectCommand = mod.PutObjectCommand;
    CopyObjectCommand = mod.CopyObjectCommand;
  }

  const client = new S3Client({});
  const s3 = {
    async headObject(input) {
      try {
        return await client.send(new HeadObjectCommand(input));
      } catch (err) {
        err.code = err.name || err.code;
        throw err;
      }
    },
    async putObject(input) {
      return client.send(new PutObjectCommand(input));
    },
    async copyObject(input) {
      return client.send(new CopyObjectCommand(input));
    },
  };

  if (provider === 'awin') {
    const result = await upsertAwinAffiliateFolder({
      s3,
      bucket,
      advertiserId: id,
      patch,
      now,
      dryRun,
    });
    process.stdout.write(JSON.stringify({
      action: result.action,
      key: result.key,
      enabled: result.metadata.enabled || '',
      disabledreason: result.metadata.disabledreason || '',
    }) + '\n');
    return;
  }

  // Generic provider path
  const key = affiliateMarkerKey(provider, id);
  let existing = null;
  try {
    const head = await s3.headObject({ Bucket: bucket, Key: key });
    existing = coerceStringMap(head.Metadata || head.metadata);
  } catch (err) {
    const code = err && (err.code || err.name);
    const status = err && err.$metadata && err.$metadata.httpStatusCode;
    if (code !== 'NotFound' && code !== 'NoSuchKey' && status !== 404) throw err;
  }
  const merged = mergeAffiliateMeta(existing || {}, {
    affiliateid: id,
    ...patch,
  }, { now });
  for (const k of ['lastdownload', 'laststatus', 'lastsize', 'lastok']) {
    if (existing && existing[k] && !merged[k]) merged[k] = existing[k];
  }
  if (!dryRun) {
    if (existing) {
      await s3.copyObject({
        Bucket: bucket,
        CopySource: `${bucket}/${key}`,
        Key: key,
        Metadata: merged,
        MetadataDirective: 'REPLACE',
        ContentType: 'application/octet-stream',
        ServerSideEncryption: 'AES256',
      });
    } else {
      await s3.putObject({
        Bucket: bucket,
        Key: key,
        Body: Buffer.alloc(0),
        Metadata: merged,
        ContentType: 'application/octet-stream',
        ServerSideEncryption: 'AES256',
      });
    }
  }
  process.stdout.write(JSON.stringify({
    action: dryRun ? (existing ? 'would_update' : 'would_create') : (existing ? 'updated' : 'created'),
    key,
    enabled: merged.enabled || '',
    disabledreason: merged.disabledreason || '',
  }) + '\n');
}

main().catch((err) => {
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
});
