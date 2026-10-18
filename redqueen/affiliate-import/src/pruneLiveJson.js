'use strict';

/**
 * FR #4001: remove parts from a-clubs live.json using the part-live index.
 * Writes follow #3968: bump GUID lastmod + host lastmod; leave init alone.
 * #3987: bumping lastmod marks the GUID stale for the annotation agent --- intentional.
 */

const {
  widgetFileKey,
  hostMarkerKey,
} = require('../../../parts-gateway/src/aClubsKeys');
const { liveEntryMatchesPart, normalizePartKey } = require('./partKey');

/**
 * @param {unknown} body
 * @returns {object[]}
 */
function parseLiveBody(body) {
  if (body == null) return [];
  let text;
  if (Buffer.isBuffer(body)) text = body.toString('utf8');
  else if (typeof body === 'string') text = body;
  else text = String(body);
  try {
    const raw = JSON.parse(text);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * @param {{
 *   removedKeys: string[],
 *   index: { locationsFor: Function, remove: Function },
 *   getObject: Function,
 *   putObject: Function,
 *   copyObject?: Function,
 *   touchLastmod: (opts: { host: string, guid?: string }) => Promise<void>,
 *   keyFromString?: (s: string) => { provider: string, affiliateid: string, partid: string },
 * }} opts
 */
async function pruneRemovedPartsFromLiveJson(opts) {
  const keyFromString =
    opts.keyFromString ||
    ((s) => {
      const [provider, affiliateid, partid] = String(s).split('\0');
      return normalizePartKey({ provider, affiliateid, partid });
    });

  /** @type {Map<string, { host: string, guid: string, keys: object[] }>} */
  const byLoc = new Map();
  for (const ks of opts.removedKeys || []) {
    const key = keyFromString(ks);
    for (const loc of opts.index.locationsFor(key)) {
      const id = `${loc.host}\0${loc.guid}`;
      const row = byLoc.get(id) || {
        host: loc.host,
        guid: loc.guid,
        keys: [],
      };
      row.keys.push(key);
      byLoc.set(id, row);
    }
  }

  let prunedEntries = 0;
  const touchedHosts = new Set();

  for (const loc of byLoc.values()) {
    const liveKey = widgetFileKey(loc.host, loc.guid, 'live.json');
    let obj;
    try {
      obj = await opts.getObject({ Key: liveKey, Bucket: 'a-clubs' });
    } catch {
      continue;
    }
    let body = obj && (obj.Body != null ? obj.Body : obj.body);
    if (body && typeof body.transformToString === 'function') {
      body = await body.transformToString();
    }
    const live = parseLiveBody(body);
    const next = live.filter(
      (entry) => !loc.keys.some((k) => liveEntryMatchesPart(entry, k)),
    );
    const removedHere = live.length - next.length;
    if (removedHere <= 0) continue;
    prunedEntries += removedHere;
    const Body = Buffer.from(`${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await opts.putObject({
      Key: liveKey,
      Bucket: 'a-clubs',
      Body,
      ContentLength: Body.length,
      ContentType: 'application/json; charset=utf-8',
    });
    await opts.touchLastmod({ host: loc.host, guid: loc.guid });
    touchedHosts.add(loc.host);
    for (const k of loc.keys) {
      opts.index.remove(k, { host: loc.host, guid: loc.guid });
    }
  }

  for (const host of touchedHosts) {
    await opts.touchLastmod({ host });
    void hostMarkerKey; // documented key shape for reviewers
  }

  return { prunedEntries, locationsTouched: byLoc.size };
}

module.exports = {
  pruneRemovedPartsFromLiveJson,
  parseLiveBody,
};
