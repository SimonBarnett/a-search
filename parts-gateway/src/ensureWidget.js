'use strict';

/**
 * FR #3968 / #3987: auto-create a-clubs/{hostkey}/{guid}/ with seeded JSON files.
 * GUID marker metadata on widget.json: uri, seen, clicks, since, lastmod, annotated.
 */

const { assertWidgetGuid } = require('../../shared/widgets/widgetPath');
const { normalizeHost } = require('../../shared/components/customers');
const { safeHostFolderName } = require('../../shared/widgets/hostFolderMeta');
const { widgetFileKey } = require('./aClubsKeys');
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
 *   sendMessage?: Function,
 *   folderEventsQueueUrl?: string,
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

  const createdAt = new Date().toISOString();
  const uri = resolvePageUri(opts);
  const metadata = {
    uri: uri || '',
    seen: '0',
    clicks: '0',
    since: createdAt,
    lastmod: createdAt,
    annotated: '0',
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

  // FR #3987: resend host message for every new GUID so redqueen annotates it
  // (host-only event schema; agent lists GUID folders itself).
  if (w.created && typeof opts.sendMessage === 'function' && opts.folderEventsQueueUrl) {
    await publishFolderEvent({
      sendMessage: opts.sendMessage,
      queueUrl: opts.folderEventsQueueUrl,
      hostkey: safeHostFolderName(host),
      host,
      createdAt,
      reason: `guid:${guid}`,
    });
  }

  return { created: w.created, layout, uri, metadata };
}

module.exports = {
  ensureAclubsWidget,
};
