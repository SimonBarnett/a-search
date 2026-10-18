'use strict';

/**
 * In-memory S3 stand-in for FR #3968 unit tests (If-None-Match: * semantics).
 */

function createMemoryS3() {
  /** @type {Map<string, { Body: Buffer, Metadata?: Record<string,string>, Tagging?: string }>} */
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

  async function headObject({ Key }) {
    const o = objects.get(Key);
    if (!o) throw notFound(Key);
    return { Metadata: { ...(o.Metadata || {}) }, ContentLength: o.Body.length };
  }

  async function putObject(input) {
    const Key = input.Key;
    const ifNone = input.IfNoneMatch || input.IfNoneMatch;
    if (ifNone === '*' && objects.has(Key)) {
      throw precondition(Key);
    }
    const Body = Buffer.isBuffer(input.Body)
      ? input.Body
      : Buffer.from(input.Body == null ? '' : String(input.Body), 'utf8');
    objects.set(Key, {
      Body,
      Metadata: input.Metadata ? { ...input.Metadata } : {},
      Tagging: input.Tagging,
    });
    return { ETag: '"mem"' };
  }

  async function getObject({ Key }) {
    const o = objects.get(Key);
    if (!o) throw notFound(Key);
    return { Body: Buffer.from(o.Body), Metadata: { ...(o.Metadata || {}) } };
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
    o.TagSet = Tagging && Tagging.TagSet;
    return {};
  }

  return {
    objects,
    headObject,
    putObject,
    getObject,
    listObjectsV2,
    putObjectTagging,
  };
}

module.exports = {
  createMemoryS3,
};
