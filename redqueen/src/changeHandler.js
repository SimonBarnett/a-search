'use strict';

/**
 * FR #4827: map one a-clubs change event onto the annotator.
 * searches.json → POST /search when the content hash changed.
 * widget.json / folder markers → processFolderEvent (host, then GUIDs).
 * Events whose etag is in opts.selfEtags are the annotator's own writes.
 */

const { parseChangeEvent, normEtag } = require('../../shared/aClubs/changeEvents');
const { searchesContentHash, shouldPostSearch } = require('../../shared/aClubs/searchesHash');
const { processFolderEvent } = require('./annotate');
const { publishGuidSearch } = require('./guidSearch');

/**
 * @param {Map<string, string>|undefined} selfEtags
 * @param {string} key
 * @param {string} [etag]
 * @returns {boolean}
 */
function isSelfEtag(selfEtags, key, etag) {
  if (!etag || !selfEtags || typeof selfEtags.get !== 'function') return false;
  const prev = selfEtags.get(key);
  if (!prev) return false;
  return normEtag(prev) === normEtag(etag);
}

/**
 * @param {object} opts
 * @param {string} key
 * @param {string} nowIso
 */
async function bumpMarkerLastmod(opts, key, nowIso) {
  if (typeof opts.copyObject !== 'function' || typeof opts.headObject !== 'function') return;
  let prev = {};
  try {
    const head = await opts.headObject({ Key: key });
    prev = (head && (head.Metadata || head.metadata)) || {};
  } catch {
    return;
  }
  const Metadata = {};
  const names = Object.keys(prev);
  for (let i = 0; i < names.length; i += 1) {
    Metadata[names[i]] = String(prev[names[i]]);
  }
  Metadata.lastmod = nowIso;
  const bucket = opts.bucket || process.env.A_CLUBS_BUCKET || 'a-clubs';
  const resp = await opts.copyObject({
    Key: key,
    CopySource: `${bucket}/${key}`,
    Metadata,
    MetadataDirective: 'REPLACE',
  });
  const etag = resp && ((resp.CopyObjectResult && resp.CopyObjectResult.ETag) || resp.ETag);
  if (etag && opts.selfEtags && typeof opts.selfEtags.set === 'function') {
    opts.selfEtags.set(key, normEtag(etag));
  }
}

/**
 * @param {object} opts
 * @param {{ hostkey: string }} event
 * @returns {Promise<string>}
 */
async function resolveHost(opts, event) {
  if (event.host) return String(event.host);
  const markerKey = `${String(event.hostkey).replace(/\/+$/, '')}/`;
  if (typeof opts.headObject === 'function') {
    try {
      const head = await opts.headObject({ Key: markerKey });
      const md = (head && (head.Metadata || head.metadata)) || {};
      if (md.host) return String(md.host);
    } catch {
      // fall through to hostkey
    }
  }
  return String(event.hostkey);
}

/**
 * @param {object} opts
 * @returns {Promise<object>}
 */
async function handleChangeEvent(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('handleChangeEvent opts required');
  }
  const event = opts.event || parseChangeEvent(opts.body);
  if (!event) return { action: 'skipped', detail: 'excluded_key' };
  if (isSelfEtag(opts.selfEtags, event.key, event.etag)) {
    return { action: 'dropped', detail: 'self_etag', key: event.key };
  }

  if (event.kind === 'searches') {
    if (!event.guid) return { action: 'skipped', detail: 'searches_no_guid', key: event.key };
    const published = await publishGuidSearch({
      ...opts,
      hostkey: event.hostkey,
      guid: event.guid,
      repostExisting: true,
    });
    if (published && published.reason === 'searches_empty_seed') {
      return {
        action: 'skipped',
        detail: 'searches_empty_seed',
        key: event.key,
      };
    }
    return {
      action: published && published.idempotent && !published.wrote ? 'skipped' : 'search_posted',
      detail: published && published.wrote ? 'searches_posted' : 'searches_unchanged',
      searchid: published && published.searchid,
      searcheshash: published && published.searcheshash,
      wrote: !!(published && published.wrote),
      key: event.key,
    };
  }

  if (event.kind === 'widget' || event.kind === 'marker') {
    const nowIso = (opts.now ? opts.now() : new Date()).toISOString();
    if (event.kind === 'widget') {
      const hostkey = String(event.hostkey).replace(/\/+$/, '');
      const markerKey = event.guid ? `${hostkey}/${event.guid}/` : `${hostkey}/`;
      await bumpMarkerLastmod(opts, markerKey, nowIso);
    }
    const host = await resolveHost(opts, event);
    const runner = typeof opts.processFolderEvent === 'function'
      ? opts.processFolderEvent
      : processFolderEvent;
    const forwarded = { ...opts };
    delete forwarded.processFolderEvent;
    delete forwarded.event;
    delete forwarded.body;
    return runner({
      ...forwarded,
      event: {
        hostkey: event.hostkey,
        host,
        createdAt: nowIso,
      },
    });
  }

  return { action: 'skipped', detail: 'other_kind', kind: event.kind, key: event.key };
}

module.exports = {
  handleChangeEvent,
  isSelfEtag,
  bumpMarkerLastmod,
  searchesContentHash,
  shouldPostSearch,
};
