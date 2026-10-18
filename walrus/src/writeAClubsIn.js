'use strict';

/**
 * FR-3951: write one search JSON under a-clubs/{host}/{guid}/IN/{searchId}.json
 * on the mapped rclone drive (filesystem). No inbound ports.
 */

const fs = require('node:fs');
const path = require('node:path');

const { aClubsInAbsPath, aClubsInKey, hostGuidFromMessage } = require('./aClubsInPath');

/**
 * @param {{
 *   root: string,
 *   msg: object,
 *   products?: unknown[],
 *   body?: object,
 * }} opts
 * @returns {{ abs: string, key: string, bucket: string }}
 */
function writeAClubsIn(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('write_a_clubs_opts_required');
  }
  const root = opts.root != null ? String(opts.root).trim() : '';
  if (!root) throw new Error('empty_a_clubs_root');
  const msg = opts.msg;
  const { host, guid } = hostGuidFromMessage(msg);
  const searchId = msg && msg.searchId != null ? String(msg.searchId).trim() : '';
  if (!searchId) throw new Error('empty_searchId');

  const key = aClubsInKey({ host, guid, searchId });
  const abs = aClubsInAbsPath({ root, host, guid, searchId });
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  const body =
    opts.body && typeof opts.body === 'object'
      ? opts.body
      : {
          searchId,
          source: msg.source != null ? String(msg.source).trim() : '',
          userId: msg.userId != null ? String(msg.userId).trim() : '',
          host,
          guid,
          products: Array.isArray(opts.products) ? opts.products : [],
        };

  fs.writeFileSync(abs, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  return { abs, key, bucket: 'a-clubs' };
}

/**
 * putObject shim so existing local workers' writeResults land on a-clubs IN/.
 * @param {{ root: string, msg: object }} opts
 */
function createAClubsPutObject(opts) {
  const root = opts && opts.root != null ? String(opts.root).trim() : '';
  const msg = opts && opts.msg;
  return async function putObject({ Body }) {
    const productsBody =
      typeof Body === 'string'
        ? (() => {
            try {
              return JSON.parse(Body);
            } catch {
              return { raw: String(Body) };
            }
          })()
        : Body;
    const products =
      productsBody && Array.isArray(productsBody.products)
        ? productsBody.products
        : [];
    return writeAClubsIn({
      root,
      msg,
      products,
      body: productsBody && typeof productsBody === 'object' ? productsBody : undefined,
    });
  };
}

module.exports = {
  writeAClubsIn,
  createAClubsPutObject,
};
