'use strict';

const {
  S3Client,
  HeadObjectCommand,
  CopyObjectCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');

const s3 = new S3Client({ region: process.env.AWS_REGION || 'eu-west-2' });
const bucket = 'a-affiliates';

async function mergeMeta(key, patch) {
  let existing = {};
  let contentType = 'application/x-directory';
  let exists = true;
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    existing = { ...(head.Metadata || {}) };
    if (head.ContentType) contentType = head.ContentType;
  } catch (e) {
    const status = e && e.$metadata && e.$metadata.httpStatusCode;
    if (e.name === 'NotFound' || e.Code === 'NotFound' || status === 404) {
      exists = false;
    } else {
      throw e;
    }
  }

  const lastmod = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const Metadata = { ...existing, ...patch, lastmod };
  for (const [k, v] of Object.entries(Metadata)) {
    Metadata[k] = String(v ?? '');
  }

  if (!exists) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.alloc(0),
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
        Metadata,
      }),
    );
    console.log('created', key, JSON.stringify(patch));
    return;
  }

  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: key,
      CopySource: `${bucket}/${key}`,
      MetadataDirective: 'REPLACE',
      Metadata,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    }),
  );
  console.log(
    'updated',
    key,
    'enabled=' + (Metadata.enabled || ''),
    'defaultage=' + (Metadata.defaultage || ''),
  );
}

async function main() {
  await mergeMeta('awin/', { enabled: '1' });
  for (const p of [
    'admitad',
    'avantlink',
    'flexoffers',
    'impact',
    'partnerize',
    'tradedoubler',
    'webgains',
  ]) {
    await mergeMeta(`${p}/`, { enabled: '0' });
  }
  await mergeMeta('_root/', { defaultage: '6', name: 'a-affiliates', kind: 'root' });
}

main().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
