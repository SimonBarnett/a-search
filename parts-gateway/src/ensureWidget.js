'use strict';

/**
 * FR #3968: auto-create a-clubs/{hostkey}/{guid}/ with seeded JSON files.
 */

const { assertWidgetGuid } = require('../../shared/widgets/widgetPath');
const { normalizeHost } = require('../../shared/components/customers');
const { widgetFileKey } = require('./aClubsKeys');
const { headOrNull, putIfAbsent } = require('./s3Store');

/**
 * @param {{
 *   host: string,
 *   widgetGuid: string,
 *   customerNumber: string,
 *   layout?: string,
 *   createdVia?: string,
 *   headObject: Function,
 *   putObject: Function,
 * }} opts
 * @returns {Promise<{ created: boolean, layout: string }>}
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
    return { created: false, layout };
  }

  const widgetDoc = {
    widgetGuid: guid,
    host,
    customerNumber,
    layout,
    createdVia,
    createdAt: new Date().toISOString(),
  };

  const w = await putIfAbsent({
    putObject: opts.putObject,
    Key: widgetKey,
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

  return { created: w.created, layout };
}

module.exports = {
  ensureAclubsWidget,
};
