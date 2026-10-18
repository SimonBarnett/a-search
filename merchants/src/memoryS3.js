'use strict';

/**
 * In-memory S3 stand-in for FR #4008 unit tests (bucket-partitioned).
 */

function createMemoryS3() {
  /** @type {Map<string, Map<string, { Body: Buffer, Metadata?: Record<string,string>, ContentType?: string }>>} */
  const buckets = new Map();
  /** Flat view of Key -> object for single-bucket tests (default bucket). */
  const objects = new Map();

  function bucketMap(Bucket) {
    const name = Bucket == null || Bucket === '' ? '_default' : String(Bucket);
    let m = buckets.get(name);
    if (!m) {
      m = new Map();
      buckets.set(name, m);
    }
    return m;
  }

  /** When Bucket omitted, find Key in any bucket (test convenience). */
  function findObject(Bucket, Key) {
    if (Bucket != null && Bucket !== '') {
      return bucketMap(Bucket).get(Key) || null;
    }
    for (const m of buckets.values()) {
      if (m.has(Key)) return m.get(Key);
    }
    return null;
  }

  function syncFlat(Key, entry, remove) {
    if (remove) objects.delete(Key);
    else if (entry) objects.set(Key, entry);
  }

  function notFound(Key) {
    const err = new Error(`NoSuchKey: ${Key}`);
    err.name = 'NotFound';
    err.code = 'NotFound';
    err.$metadata = { httpStatusCode: 404 };
    return err;
  }

  async function headObject({ Bucket, Key }) {
    const o = findObject(Bucket, Key);
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
    const prev = bucketMap(input.Bucket).get(Key);
    const meta = {};
    if (input.Metadata) {
      for (const [k, v] of Object.entries(input.Metadata)) {
        meta[String(k).toLowerCase()] = String(v);
      }
    }
    const entry = {
      Body,
      Metadata: meta,
      ContentType: input.ContentType || (prev && prev.ContentType),
    };
    bucketMap(input.Bucket).set(Key, entry);
    syncFlat(Key, entry, false);
    return { ETag: '"mem"' };
  }

  async function getObject({ Bucket, Key }) {
    const o = findObject(Bucket, Key);
    if (!o) throw notFound(Key);
    return {
      Body: Buffer.from(o.Body),
      Metadata: { ...(o.Metadata || {}) },
      ContentType: o.ContentType,
    };
  }

  async function listObjectsV2({ Bucket, Prefix, Delimiter } = {}) {
    const prefix = Prefix == null ? '' : String(Prefix);
    const delim = Delimiter == null ? '' : String(Delimiter);
    /** @type {{ Key: string }[]} */
    const Contents = [];
    /** @type {{ Prefix: string }[]} */
    const CommonPrefixes = [];
    const seenPrefix = new Set();
    /** @type {IterableIterator<string>} */
    let keyIter;
    if (Bucket != null && Bucket !== '') {
      keyIter = bucketMap(Bucket).keys();
    } else {
      const all = [];
      for (const m of buckets.values()) {
        for (const k of m.keys()) all.push(k);
      }
      keyIter = all[Symbol.iterator]();
    }

    for (const Key of keyIter) {
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

  async function deleteObject({ Bucket, Key }) {
    bucketMap(Bucket).delete(Key);
    syncFlat(Key, null, true);
    return {};
  }

  async function deleteObjects({ Bucket, Delete }) {
    const deleted = [];
    for (const obj of (Delete && Delete.Objects) || []) {
      if (obj && obj.Key) {
        bucketMap(Bucket).delete(obj.Key);
        syncFlat(obj.Key, null, true);
        deleted.push({ Key: obj.Key });
      }
    }
    return { Deleted: deleted };
  }

  return {
    objects,
    buckets,
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
