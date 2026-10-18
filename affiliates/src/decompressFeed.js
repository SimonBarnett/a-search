'use strict';

/**
 * FR #4195: decompress affiliate feed bodies (gzip | zip | none) to a Buffer.
 * Zip: pick entry matching format ext, else first file; stored or deflate only.
 */

const zlib = require('node:zlib');
const { promisify } = require('node:util');

const gunzip = promisify(zlib.gunzip);
const inflateRaw = promisify(zlib.inflateRaw);

/**
 * @param {Buffer} body
 * @param {{ compression: string, format: string }} opts
 * @returns {Promise<{ ok: true, buffer: Buffer } | { ok: false, status: string }>}
 */
async function decompressFeedBody(body, opts) {
  const compression = String((opts && opts.compression) || 'none').toLowerCase();
  const format = String((opts && opts.format) || 'csv').toLowerCase();
  if (!Buffer.isBuffer(body)) {
    return { ok: false, status: 'decompress_error' };
  }
  if (body.length === 0) {
    return { ok: false, status: 'empty_feed' };
  }

  try {
    if (compression === 'none' || compression === '') {
      return { ok: true, buffer: body };
    }
    if (compression === 'gzip') {
      const out = await gunzip(body);
      if (!out || out.length === 0) return { ok: false, status: 'empty_feed' };
      return { ok: true, buffer: out };
    }
    if (compression === 'zip') {
      return await unzipPick(body, format);
    }
    return { ok: false, status: 'unsupported_compression' };
  } catch {
    return { ok: false, status: 'decompress_error' };
  }
}

/**
 * Minimal zip reader (local headers + central directory). No zip64.
 * @param {Buffer} buf
 * @param {string} format
 */
async function unzipPick(buf, format) {
  const eocdSig = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === eocdSig) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { ok: false, status: 'decompress_error' };

  const entryCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  /** @type {{ name: string, method: number, compSize: number, uncompSize: number, localOffset: number }[]} */
  const entries = [];
  let off = cdOffset;
  for (let n = 0; n < entryCount; n += 1) {
    if (off + 46 > buf.length) return { ok: false, status: 'decompress_error' };
    if (buf.readUInt32LE(off) !== 0x02014b50) {
      return { ok: false, status: 'decompress_error' };
    }
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const uncompSize = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOffset = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');
    entries.push({ name, method, compSize, uncompSize, localOffset });
    off += 46 + nameLen + extraLen + commentLen;
  }

  const files = entries.filter((e) => e.name && !e.name.endsWith('/'));
  if (!files.length) return { ok: false, status: 'empty_feed' };

  const want = `.${format}`;
  let pick =
    files.find((e) => e.name.toLowerCase().endsWith(want)) || files[0];

  if (pick.method !== 0 && pick.method !== 8) {
    return { ok: false, status: 'decompress_error' };
  }

  const lo = pick.localOffset;
  if (lo + 30 > buf.length || buf.readUInt32LE(lo) !== 0x04034b50) {
    return { ok: false, status: 'decompress_error' };
  }
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const dataStart = lo + 30 + nameLen + extraLen;
  const dataEnd = dataStart + pick.compSize;
  if (dataEnd > buf.length) return { ok: false, status: 'decompress_error' };
  const compressed = buf.slice(dataStart, dataEnd);

  let out;
  if (pick.method === 0) {
    out = compressed;
  } else {
    out = await inflateRaw(compressed);
  }
  if (!out || out.length === 0) return { ok: false, status: 'empty_feed' };
  return { ok: true, buffer: out };
}

module.exports = {
  decompressFeedBody,
};
