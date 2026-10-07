'use strict';

/**
 * Conditional feed download (FR-013).
 * If-None-Match / If-Modified-Since → 304 skip.
 * Matching ContentHash after download → skip upsert; bump LastChecked.
 */

const crypto = require('node:crypto');

/**
 * @param {Buffer|string} body
 * @returns {string} hex sha256
 */
function contentHash(body) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function headerGet(headers, name) {
  if (!headers) return undefined;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === want) return v;
  }
  return undefined;
}

/**
 * @param {{
 *   feed: {
 *     Source: string,
 *     FeedKey: string,
 *     Env: string,
 *     FeedUrl: string,
 *     ETag?: string|null,
 *     LastModified?: string|Date|null,
 *     ContentHash?: string|null,
 *   },
 *   httpGet: (args: { url: string, headers: Record<string, string> }) =>
 *     Promise<{ status: number, headers?: object, body?: Buffer|string }>,
 *   upsert?: (payload: object) => Promise<void>,
 *   bumpLastChecked?: (feed: object) => Promise<void>,
 * }} opts
 */
async function fetchFeed(opts) {
  const feed = opts.feed;
  if (!feed || !feed.FeedUrl) {
    throw new Error('feed.FeedUrl required');
  }
  const headers = {};
  if (feed.ETag) headers['If-None-Match'] = String(feed.ETag);
  if (feed.LastModified) {
    headers['If-Modified-Since'] =
      feed.LastModified instanceof Date
        ? feed.LastModified.toUTCString()
        : String(feed.LastModified);
  }

  const res = await opts.httpGet({ url: feed.FeedUrl, headers });
  if (res.status === 304) {
    if (opts.bumpLastChecked) await opts.bumpLastChecked(feed);
    return {
      action: 'skip_304',
      shouldUpsert: false,
      contentHash: feed.ContentHash || null,
    };
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`feed GET status ${res.status}`);
  }

  const body = Buffer.isBuffer(res.body)
    ? res.body
    : Buffer.from(res.body == null ? '' : String(res.body));
  const hash = contentHash(body);
  const etag = headerGet(res.headers, 'etag') || null;
  const lastModified = headerGet(res.headers, 'last-modified') || null;

  if (feed.ContentHash && String(feed.ContentHash) === hash) {
    if (opts.bumpLastChecked) await opts.bumpLastChecked(feed);
    return {
      action: 'skip_hash_match',
      shouldUpsert: false,
      contentHash: hash,
      etag,
      lastModified,
    };
  }

  const payload = {
    feed,
    body,
    contentHash: hash,
    etag,
    lastModified,
  };
  if (opts.upsert) await opts.upsert(payload);
  return {
    action: 'download',
    shouldUpsert: true,
    contentHash: hash,
    etag,
    lastModified,
    byteLength: body.length,
    body,
  };
}

module.exports = { fetchFeed, contentHash };
