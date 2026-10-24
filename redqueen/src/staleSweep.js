'use strict';

/**
 * FR #4827: startup and periodic sweep of a-clubs markers that never got a
 * queue message. Hosts are listed and processed before their GUIDs.
 * Stale means annotated != 1, or lastmod > lastupdate.
 */

const { processFolderEvent } = require('./annotate');

/**
 * @param {Record<string, unknown>|undefined} md
 * @returns {boolean}
 */
function isStaleMarkerMeta(md) {
  const meta = md || {};
  if (String(meta.annotated || '') !== '1') return true;
  const lastmod = String(meta.lastmod || '').trim();
  const lastupdate = String(meta.lastupdate || '').trim();
  if (lastmod && lastupdate && lastmod > lastupdate) return true;
  return false;
}

/**
 * @param {string} key
 * @returns {{ hostkey: string, guid?: string, key: string }|null}
 */
function classifyMarkerKey(key) {
  const k = String(key || '');
  let m = /^([^/]+)\/$/.exec(k);
  if (m) return { hostkey: m[1], key: k };
  m = /^([^/]+)\/([0-9a-fA-F-]{36})\/$/.exec(k);
  if (m) return { hostkey: m[1], guid: m[2].toLowerCase(), key: k };
  return null;
}

/**
 * @param {object} opts
 * @returns {Promise<Array<{ key: string, hostkey: string, guid?: string, host?: string, metadata: object }>>}
 */
async function listStaleMarkers(opts) {
  if (!opts || typeof opts.listObjectsV2 !== 'function') return [];
  const headObject = opts.headObject;
  const found = [];
  let ContinuationToken;
  do {
    const resp = await opts.listObjectsV2({
      ContinuationToken,
    });
    const contents = (resp && resp.Contents) || [];
    for (let i = 0; i < contents.length; i += 1) {
      const item = contents[i];
      const classified = classifyMarkerKey(item && item.Key);
      if (!classified) continue;
      let metadata = {};
      let host;
      if (typeof headObject === 'function') {
        try {
          const head = await headObject({ Key: classified.key });
          metadata = (head && (head.Metadata || head.metadata)) || {};
          if (metadata.host) host = String(metadata.host);
        } catch (err) {
          const status = err && err.$metadata && err.$metadata.httpStatusCode;
          const code = err && (err.name || err.code);
          if (status === 404 || code === 'NotFound' || code === 'NoSuchKey') continue;
          throw err;
        }
      }
      if (!isStaleMarkerMeta(metadata)) continue;
      const row = {
        key: classified.key,
        hostkey: classified.hostkey,
        metadata,
      };
      if (classified.guid) row.guid = classified.guid;
      if (host) row.host = host;
      found.push(row);
    }
    ContinuationToken = resp && resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (ContinuationToken);

  found.sort((a, b) => {
    if (!a.guid && b.guid) return -1;
    if (a.guid && !b.guid) return 1;
    if (a.hostkey !== b.hostkey) return a.hostkey < b.hostkey ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return found;
}

/**
 * Process each stale host once (folder handling walks GUIDs, host first).
 * @param {object} opts
 * @returns {Promise<{ scanned: number, hosts: number, actions: object[] }>}
 */
async function runStaleSweep(opts) {
  const markers = await listStaleMarkers(opts);
  const runner = opts && typeof opts.processFolderEvent === 'function'
    ? opts.processFolderEvent
    : processFolderEvent;
  const seen = new Set();
  const actions = [];
  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i];
    if (seen.has(marker.hostkey)) continue;
    seen.add(marker.hostkey);
    const nowIso = (opts.now ? opts.now() : new Date()).toISOString();
    const forwarded = { ...opts };
    delete forwarded.processFolderEvent;
    const result = await runner({
      ...forwarded,
      event: {
        hostkey: marker.hostkey,
        host: marker.host || marker.hostkey,
        createdAt: nowIso,
      },
    });
    actions.push({ hostkey: marker.hostkey, result });
  }
  return { scanned: markers.length, hosts: seen.size, actions };
}

module.exports = {
  isStaleMarkerMeta,
  classifyMarkerKey,
  listStaleMarkers,
  runStaleSweep,
};
