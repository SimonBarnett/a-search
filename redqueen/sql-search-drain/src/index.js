'use strict';

/**
 * FR #4030: redqueen SQL SQS drain --- long-poll a-search-db-backed (SQL queue),
 * run DB search on walrus LAN a-search DB (never madeiradb), write a-clubs IN/.
 *
 * Reuses walrus/src drain/poll/path helpers (moved drain ownership to redqueen;
 * walrus modules stay as the implementation library during transition).
 */

const path = require('node:path');

const walrusRoot = path.join(__dirname, '..', '..', '..', 'walrus', 'src');
const { createDrainRunner } = require(path.join(walrusRoot, 'drainRunner'));
const { createSqsPoll, DEFAULT_WAIT_S } = require(path.join(walrusRoot, 'sqsPoll'));
const { writeAClubsIn } = require(path.join(walrusRoot, 'writeAClubsIn'));
const { aClubsInKey } = require(path.join(walrusRoot, 'aClubsInPath'));
const {
  inResultKey,
  buildInResult,
  validateInResult,
} = require('../../../shared/search/inResultSchema');

/**
 * Prefer FR #4030 naming {searchid}-{source}.json; fall back via shared schema.
 * @param {{ hostkey: string, guid: string, searchid: string, products?: object[] }} opts
 * @param {string} root
 */
function writeSqlInResult(opts, root) {
  const products = opts.products || [];
  if (!Array.isArray(products) || products.length === 0) {
    return { skipped: 'no_products', key: null };
  }
  const body = buildInResult({
    searchid: opts.searchid,
    source: 'sql',
    hostkey: opts.hostkey,
    guid: opts.guid,
    products,
  });
  const key = inResultKey({
    hostkey: body.hostkey,
    guid: body.guid,
    searchid: body.searchid,
    source: 'sql',
  });
  // Filesystem write via walrus helper with searchId=searchid-source for path.
  return writeAClubsIn({
    root,
    msg: {
      host: body.hostkey,
      widgetGuid: body.guid,
      searchId: `${body.searchid}-sql`,
      source: 'sql',
      userId: body.hostkey,
    },
    products: body.products,
    body,
  });
}

module.exports = {
  createDrainRunner,
  createSqsPoll,
  DEFAULT_WAIT_S,
  writeSqlInResult,
  aClubsInKey,
  inResultKey,
  buildInResult,
  validateInResult,
  service: 'a-search-redqueen-sql-drain',
};
