'use strict';

/**
 * FR #4001: part key -> [{host, guid}] index so prune does not scan every live.json.
 * Unit path is in-memory; SQL schema in sql/002_PartLiveIndex.sql for deploy.
 */

const { partKeyString, normalizePartKey } = require('./partKey');

/**
 * @returns {{
 *   add: (key, loc) => void,
 *   remove: (key, loc) => void,
 *   locationsFor: (key) => {host: string, guid: string}[],
 *   replaceForPart: (key, locs) => void,
 *   snapshot: () => Map<string, {host: string, guid: string}[]>,
 * }}
 */
function createPartLiveIndex(seed) {
  /** @type {Map<string, {host: string, guid: string}[]>} */
  const map = new Map();
  if (seed instanceof Map) {
    for (const [k, v] of seed) map.set(k, [...v]);
  }

  function locationsFor(key) {
    const k = partKeyString(normalizePartKey(key));
    return [...(map.get(k) || [])];
  }

  function add(key, loc) {
    const k = partKeyString(normalizePartKey(key));
    const list = map.get(k) || [];
    if (
      !list.some(
        (x) => x.host === loc.host && String(x.guid) === String(loc.guid),
      )
    ) {
      list.push({ host: loc.host, guid: String(loc.guid) });
    }
    map.set(k, list);
  }

  function remove(key, loc) {
    const k = partKeyString(normalizePartKey(key));
    const list = (map.get(k) || []).filter(
      (x) => !(x.host === loc.host && String(x.guid) === String(loc.guid)),
    );
    if (list.length) map.set(k, list);
    else map.delete(k);
  }

  function replaceForPart(key, locs) {
    const k = partKeyString(normalizePartKey(key));
    if (!locs || !locs.length) map.delete(k);
    else map.set(k, locs.map((l) => ({ host: l.host, guid: String(l.guid) })));
  }

  return {
    add,
    remove,
    locationsFor,
    replaceForPart,
    snapshot: () => new Map([...map.entries()].map(([k, v]) => [k, [...v]])),
  };
}

module.exports = { createPartLiveIndex };
