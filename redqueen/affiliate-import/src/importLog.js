'use strict';

/**
 * FR #4196: idempotent import log keyed by S3 key + ETag.
 * In-memory store for unit tests; SQL DDL in sql/002_ImportLog.sql.
 */

/**
 * @returns {{
 *   has: (key: string, etag: string) => boolean,
 *   record: (row: object) => void,
 *   get: (key: string, etag: string) => object|null,
 *   rows: Map,
 * }}
 */
function createImportLogStore() {
  /** @type {Map<string, object>} */
  const rows = new Map();
  function id(key, etag) {
    return `${String(key)}|${String(etag || '')}`;
  }
  return {
    rows,
    has(key, etag) {
      return rows.has(id(key, etag));
    },
    get(key, etag) {
      return rows.get(id(key, etag)) || null;
    },
    record(row) {
      const key = String(row.key || '');
      const etag = String(row.etag || '');
      rows.set(id(key, etag), {
        key,
        etag,
        provider: row.provider || null,
        affiliateid: row.affiliateid || null,
        status: row.status || 'ok',
        at: row.at || new Date().toISOString(),
      });
    },
  };
}

module.exports = { createImportLogStore };
