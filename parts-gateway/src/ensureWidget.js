'use strict';

/**
 * FR #3968: auto-create a-clubs/{hostkey}/{guid}/ with seeded JSON files.
 * GUID folder marker (zero-byte trailing-slash key) carries metadata:
 * uri, seen, clicks, since, lastmod, annotated, init --- not widget.json.
 * Prefer Referer path for uri (see pageUri.js).
 * Seed writes bump GUID + host lastmod; publish host folder event on new GUID.
 */

const { assertWidgetGuid } = require('../../shared/widgets/widgetPath');
const { normalizeHost } = require('../../shared/components/customers');
const {
  safeHostFolderName,
  touchLastmod,
  isoLastmod,
} = require('../../shared/widgets/hostFolderMeta');
const {
  widgetFileKey,
  hostMarkerKey,
  guidMarkerKey,
} = require('./aClubsKeys');
const { headOrNull, putIfAbsent } = require('./s3Store');
const { publishFolderEvent } = require('./publishFolderEvent');
const { resolvePageUri } = require('./pageUri');

/**
 * @param {{
 *   host: string,
 *   widgetGuid: string,
 *   userid: string,
 *   layout?: string,
 *   createdVia?: string,
 *   referer?: string,
 *   pageUri?: string,
 *   uri?: string,
 *   headObject: Function,
 *   putObject: Function,
 *   getObject?: Function,
 *   copyObject?: Function,
 *   getObjectTagging?: Function,
 *   putObjectTagging?: Function,
 *   sendMessage?: Function,
 *   folderEventsQueueUrl?: string,
 *   now?: Date|string|number,
 * }} opts
 * @returns {Promise<{ created: boolean, layout: string, uri: string, metadata: object }>}
 */
async function ensureAclubsWidget(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('ensureAclubsWidget opts required');
  }
  const host = normalizeHost(opts.host);
  const guid = assertWidgetGuid(opts.widgetGuid);
  const userid = String(opts.userid || '').trim();
  if (!userid) {
    const err = new Error('userid_required');
    err.code = 'userid_required';
    throw err;
  }
  const layout =
    opts.layout == null || opts.layout === ''
      ? 'horizontal'
      : String(opts.layout).trim();
  const createdVia =
    opts.createdVia == null || opts.createdVia === ''
      ? 'extension'
      : String(opts.createdVia).trim();

  const markerKey = guidMarkerKey(host, guid);
  const existing = await headOrNull({
    headObject: opts.headObject,
    Key: markerKey,
  });
  if (existing) {
    const md = existing.Metadata || existing.metadata || {};
    return {
      created: false,
      layout,
      uri: String(md.uri || ''),
      metadata: md,
    };
  }

  const createdAt = isoLastmod(opts.now);
  const uri = resolvePageUri(opts);
  const metadata = {
    uri: uri || '',
    seen: '0',
    clicks: '0',
    since: createdAt,
    lastmod: createdAt,
    annotated: '0',
    init: '0',
  };

  const markerPut = await putIfAbsent({
    putObject: opts.putObject,
    Key: markerKey,
    Body: Buffer.alloc(0),
    Metadata: metadata,
  });

  const widgetDoc = {
    widgetGuid: guid,
    host,
    userid,
    layout,
    createdVia,
    createdAt,
    uri: uri || undefined,
  };

  await putIfAbsent({
    putObject: opts.putObject,
    Key: widgetFileKey(host, guid, 'widget.json'),
    Body: `${JSON.stringify(widgetDoc, null, 2)}\n`,
    ContentType: 'application/json; charset=utf-8',
  });

  await putIfAbsent({
    putObject: opts.putObject,
    Key: widgetFileKey(host, guid, 'live.json'),
    Body: '[]\n',
    ContentType: 'application/json; charset=utf-8',
  });

  await putIfAbsent({
    putObject: opts.putObject,
    Key: widgetFileKey(host, guid, 'searches.json'),
    Body: `${JSON.stringify({ queries: [], exclude: [] }, null, 2)}\n`,
    ContentType: 'application/json; charset=utf-8',
  });

  if (markerPut.created) {
    const s3Touch = {
      headObject: opts.headObject,
      getObject: opts.getObject,
      copyObject: opts.copyObject,
      putObject: opts.putObject,
      getObjectTagging: opts.getObjectTagging,
      putObjectTagging: opts.putObjectTagging,
      now: opts.now,
    };
    // Seed writes bump GUID lastmod and host lastmod.
    const bumped = await touchLastmod({ Key: markerKey, ...s3Touch });
    Object.assign(metadata, bumped.metadata);
    await touchLastmod({ Key: hostMarkerKey(host), ...s3Touch });

    if (typeof opts.sendMessage === 'function' && opts.folderEventsQueueUrl) {
      await publishFolderEvent({
        sendMessage: opts.sendMessage,
        queueUrl: opts.folderEventsQueueUrl,
        hostkey: safeHostFolderName(host),
        host,
        createdAt,
        reason: `guid:${guid}`,
      });
    }
  }

  return { created: markerPut.created, layout, uri, metadata };
}

module.exports = {
  ensureAclubsWidget,
};
