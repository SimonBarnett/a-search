'use strict';

/**
 * In-memory S3 stand-in for FR #3999 unit tests.
 */

function createMemoryS3() {
  /** @type {Map<string, { Body: Buffer, Metadata?: Record<string,string>, ContentType?: string }>} */
  const objects = new Map();

  function notFound(Key) {
    const err = new Error(`NoSuchKey: ${Key}`);
    err.name = 'NotFound';
    err.code = 'NotFound';
    err.$metadata = { httpStatusCode: 404 };
    return err;
  }

  async function headObject({ Key }) {
    const o = objects.get(Key);
    if (!o) throw notFound(Key);
    return {
      Metadata: { ...(o.Metadata || {}) },
      ContentLength: o.Body.length,
      ContentType: o.ContentType,
    };
  }

  async function putObject(input) {
    const Key = input.Key;
    const Body = Buffer.isBuffer(input.Body)
      ? input.Body
      : Buffer.from(input.Body == null ? '' : String(input.Body), 'utf8');
    const prev = objects.get(Key);
    const meta = {};
    if (input.Metadata) {
      for (const [k, v] of Object.entries(input.Metadata)) {
        meta[String(k).toLowerCase()] = String(v);
      }
    }
    objects.set(Key, {
      Body,
      Metadata: meta,
      ContentType: input.ContentType || (prev && prev.ContentType),
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
    };
  }

  async function listObjectsV2({ Prefix, Delimiter } = {}) {
    const prefix = Prefix == null ? '' : String(Prefix);
    const delim = Delimiter == null ? '' : String(Delimiter);
    /** @type {{ Key: string }[]} */
    const Contents = [];
    /** @type {{ Prefix: string }[]} */
    const CommonPrefixes = [];
    const seenPrefix = new Set();

    for (const Key of objects.keys()) {
      if (!Key.startsWith(prefix)) continue;
      if (!delim) {
        Contents.push({ Key });
        continue;
      }
      const rest = Key.slice(prefix.length);
      const idx = rest.indexOf(delim);
      if (idx >= 0) {
        const cp = prefix + rest.slice(0, idx + delim.length);
        if (!seenPrefix.has(cp)) {
          seenPrefix.add(cp);
          CommonPrefixes.push({ Prefix: cp });
        }
      } else {
        Contents.push({ Key });
      }
    }
    return { Contents, CommonPrefixes };
  }

  async function deleteObject({ Key }) {
    objects.delete(Key);
    return {};
  }

  async function deleteObjects({ Delete }) {
    const deleted = [];
    for (const obj of (Delete && Delete.Objects) || []) {
      if (obj && obj.Key) {
        objects.delete(obj.Key);
        deleted.push({ Key: obj.Key });
      }
    }
    return { Deleted: deleted };
  }

  return {
    objects,
    headObject,
    putObject,
    getObject,
    listObjectsV2,
    deleteObject,
    deleteObjects,
  };
}

module.exports = {
  createMemoryS3,
};
