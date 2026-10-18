'use strict';

/**
 * FR #3968 / #3987: auto-create a-clubs/{hostkey}/{guid}/ with seeded JSON files.
 * GUID marker metadata on widget.json: uri, seen, clicks, since, lastmod,
 * annotated, init. Prefer Referer path for uri (see pageUri.js).
 * Seed writes bump GUID + host lastmod; publish host folder event on new GUID
 * so redqueen can annotate GUIDs under already-annotated hosts.
 */

const { assertWidgetGuid } = require('../../shared/widgets/widgetPath');
const { normalizeHost } = require('../../shared/components/customers');
const {
  safeHostFolderName,
  touchLastmod,
  isoLastmod,
} = require('../../shared/widgets/hostFolderMeta');
const { widgetFileKey, hostMarkerKey } = require('./aClubsKeys');
const { headOrNull, putIfAbsent } = require('./s3Store');
const { publishFolderEvent } = require('./publishFolderEvent');
const { resolvePageUri } = require('./pageUri');

/**
 * @param {{
 *   host: string,
 *   widgetGuid: string,
 *   customerNumber: string,
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
  const customerNumber = String(opts.customerNumber || '').trim();
  if (!customerNumber) {
    const err = new Error('customer_number_required');
    err.code = 'customer_number_required';
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

  const widgetKey = widgetFileKey(host, guid, 'widget.json');
  const existing = await headOrNull({
    headObject: opts.headObject,
    Key: widgetKey,
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

  const widgetDoc = {
    widgetGuid: guid,
    host,
    customerNumber,
    layout,
    createdVia,
    createdAt,
    uri: uri || undefined,
  };

  const w = await putIfAbsent({
    putObject: opts.putObject,
    Key: widgetKey,
    Body: `${JSON.stringify(widgetDoc, null, 2)}\n`,
    ContentType: 'application/json; charset=utf-8',
    Metadata: metadata,
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

  if (w.created) {
    // Seed writes bump GUID lastmod and host lastmod when S3 touch helpers exist.
    if (
      typeof opts.getObject === 'function' ||
      typeof opts.copyObject === 'function'
    ) {
      const s3Touch = {
        headObject: opts.headObject,
        getObject: opts.getObject,
        copyObject: opts.copyObject,
        putObject: opts.putObject,
        getObjectTagging: opts.getObjectTagging,
        putObjectTagging: opts.putObjectTagging,
        now: opts.now,
      };
      const bumped = await touchLastmod({ Key: widgetKey, ...s3Touch });
      Object.assign(metadata, bumped.metadata);
      await touchLastmod({ Key: hostMarkerKey(host), ...s3Touch });
    }

    // FR #3987: resend host message for every new GUID so redqueen annotates it
    // (host-only event schema; agent lists GUID folders itself).
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

  return { created: w.created, layout, uri, metadata };
}

module.exports = {
  ensureAclubsWidget,
};
