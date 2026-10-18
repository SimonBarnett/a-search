'use strict';

/**
 * In-memory S3 stand-in for FR #3968 / #4098 unit tests
 * (If-None-Match: * + copyObject + object annotations).
 */

function createMemoryS3() {
  /** @type {Map<string, { Body: Buffer, Metadata?: Record<string,string>, Tagging?: string, TagSet?: {Key:string,Value:string}[], ContentType?: string, Annotations?: Map<string, Buffer> }>} */
  const objects = new Map();

  function notFound(Key) {
    const err = new Error(`NoSuchKey: ${Key}`);
    err.name = 'NotFound';
    err.code = 'NotFound';
    err.$metadata = { httpStatusCode: 404 };
    return err;
  }

  function precondition(Key) {
    const err = new Error(`PreconditionFailed: ${Key}`);
    err.name = 'PreconditionFailed';
    err.code = 'PreconditionFailed';
    err.$metadata = { httpStatusCode: 412 };
    return err;
  }

  function decodeCopySource(CopySource) {
    const raw = String(CopySource || '').replace(/^\//, '');
    const slash = raw.indexOf('/');
    const keyPart = slash >= 0 ? raw.slice(slash + 1) : raw;
    try {
      return decodeURIComponent(keyPart);
    } catch {
      return keyPart;
    }
  }

  async function headObject({ Key }) {
    const o = objects.get(Key);
    if (!o) throw notFound(Key);
    return {
      Metadata: { ...(o.Metadata || {}) },
      ContentLength: o.Body.length,
      ContentType: o.ContentType,
      ETag: '"mem"',
    };
  }

  async function putObject(input) {
    const Key = input.Key;
    const ifNone = input.IfNoneMatch;
    if (ifNone === '*' && objects.has(Key)) {
      throw precondition(Key);
    }
    const Body = Buffer.isBuffer(input.Body)
      ? input.Body
      : Buffer.from(input.Body == null ? '' : String(input.Body), 'utf8');
    const prev = objects.get(Key);
    // Preserve annotations across metadata-only rewrites (FR #4098).
    objects.set(Key, {
      Body,
      Metadata: input.Metadata ? { ...input.Metadata } : {},
      Tagging: input.Tagging,
      TagSet: prev && prev.TagSet,
      ContentType: input.ContentType || (prev && prev.ContentType),
      Annotations: prev && prev.Annotations
        ? new Map(prev.Annotations)
        : new Map(),
    });
    return { ETag: '"mem"' };
  }

  async function getObject({ Key }) {
    const o = objects.get(Key);
    if (!o) throw notFound(Key);
    return {
      Body: Buffer.from(o.Body),
      Metadata: { ...(o.Metadata || {}) },
      ContentType: o.ContentType,
      ETag: '"mem"',
    };
  }

  async function listObjectsV2({ Prefix }) {
    const prefix = Prefix == null ? '' : String(Prefix);
    const Contents = [];
    for (const Key of objects.keys()) {
      if (Key.startsWith(prefix)) Contents.push({ Key });
    }
    return { Contents };
  }

  async function putObjectTagging({ Key, Tagging }) {
    const o = objects.get(Key);
    if (!o) throw notFound(Key);
    o.TagSet = Tagging && Tagging.TagSet
      ? Tagging.TagSet.map((t) => ({
          Key: String(t.Key),
          Value: t.Value == null ? '' : String(t.Value),
        }))
      : undefined;
    return {};
  }

  async function getObjectTagging({ Key }) {
    const o = objects.get(Key);
    if (!o) throw notFound(Key);
    return { TagSet: o.TagSet ? o.TagSet.map((t) => ({ ...t })) : [] };
  }

  async function copyObject(input) {
    const destKey = input.Key;
    const srcKey = decodeCopySource(input.CopySource);
    const src = objects.get(srcKey);
    if (!src) throw notFound(srcKey);
    const replace = String(input.MetadataDirective || '').toUpperCase() === 'REPLACE';
    const metadata = replace
      ? { ...(input.Metadata || {}) }
      : { ...(src.Metadata || {}) };
    const copyTags =
      String(input.TaggingDirective || 'COPY').toUpperCase() !== 'REPLACE';
    // In-place metadata REPLACE keeps annotations (FR #4098 survival).
    const keepAnn = destKey === srcKey;
    objects.set(destKey, {
      Body: Buffer.from(src.Body),
      Metadata: metadata,
      Tagging: src.Tagging,
      TagSet: copyTags && src.TagSet ? src.TagSet.map((t) => ({ ...t })) : src.TagSet,
      ContentType: input.ContentType || src.ContentType,
      Annotations: keepAnn && src.Annotations
        ? new Map(src.Annotations)
        : new Map(),
    });
    return { CopyObjectResult: { ETag: '"mem-copy"' } };
  }

  async function putObjectAnnotation({ Key, AnnotationName, AnnotationPayload }) {
    const o = objects.get(Key);
    if (!o) throw notFound(Key);
    if (!o.Annotations) o.Annotations = new Map();
    const buf = Buffer.isBuffer(AnnotationPayload)
      ? AnnotationPayload
      : Buffer.from(String(AnnotationPayload ?? ''), 'utf8');
    o.Annotations.set(String(AnnotationName), buf);
    return { ETag: '"mem-ann"' };
  }

  async function getObjectAnnotation({ Key, AnnotationName }) {
    const o = objects.get(Key);
    if (!o) throw notFound(Key);
    const buf = o.Annotations && o.Annotations.get(String(AnnotationName));
    if (!buf) {
      const err = new Error(`NoSuchAnnotation: ${AnnotationName}`);
      err.name = 'NoSuchAnnotation';
      err.code = 'NoSuchAnnotation';
      err.$metadata = { httpStatusCode: 404 };
      throw err;
    }
    return { AnnotationPayload: Buffer.from(buf), AnnotationName: String(AnnotationName) };
  }

  async function listObjectAnnotations({ Key }) {
    const o = objects.get(Key);
    if (!o) throw notFound(Key);
    const Annotations = [];
    if (o.Annotations) {
      for (const [AnnotationName, buf] of o.Annotations.entries()) {
        Annotations.push({ AnnotationName, Size: buf.length });
      }
    }
    return { Annotations };
  }

  return {
    objects,
    headObject,
    putObject,
    getObject,
    listObjectsV2,
    putObjectTagging,
    getObjectTagging,
    copyObject,
    putObjectAnnotation,
    getObjectAnnotation,
    listObjectAnnotations,
  };
}

module.exports = {
  createMemoryS3,
};
