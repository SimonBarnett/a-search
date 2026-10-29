'use strict';

/**
 * Mapping upsert / get API (FR-054b).
 *
 * Record shape (see docs/fr/FR-054.md / docs/s3-mapping.md when merged):
 *   { env, userId, source, tokenOrClickRef|token, s3Key,
 *     catalogId?, searchId?, createdAt?, meta? }
 *
 * Natural key: (env, userId, source, tokenOrClickRef).
 * Durable store (FR-054c LOCKED): S3 via `createS3MappingStore` in
 * `./s3Store.js` — callers inject `deps.store` (`get`/`put`/`listByUserId`).
 * List-by-userId for performance joins: `listMappingsByUserId` (FR-054e).
 */

class MappingError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   */
  constructor(message, code = 'mapping') {
    super(message);
    this.name = 'MappingError';
    this.code = code;
  }
}

/**
 * @param {object} row
 * @returns {string}
 */
function resolveToken(row) {
  if (!row || typeof row !== 'object') return '';
  if (row.tokenOrClickRef != null && String(row.tokenOrClickRef).trim() !== '') {
    return String(row.tokenOrClickRef).trim();
  }
  if (row.token != null && String(row.token).trim() !== '') {
    return String(row.token).trim();
  }
  return '';
}

/**
 * Natural key string for store lookups.
 * @param {{ env: string, userId: string, source: string, tokenOrClickRef: string }} parts
 */
function mappingNaturalKey(parts) {
  const env = String(parts.env || '').trim();
  const userId = String(parts.userId || '').trim();
  const source = String(parts.source || '').trim();
  const token = String(parts.tokenOrClickRef || parts.token || '').trim();
  if (!env || !userId || !source || !token) {
    throw new MappingError(
      'mapping natural key needs env, userId, source, token',
      'mapping_bad_key',
    );
  }
  return `${env}\u0000${userId}\u0000${source}\u0000${token}`;
}

/**
 * @param {object} row
 * @returns {object}
 */
function normalizeMapping(row) {
  if (!row || typeof row !== 'object') {
    throw new MappingError('mapping row must be an object', 'mapping_invalid');
  }
  const env = row.env != null ? String(row.env).trim() : '';
  const userId = row.userId != null ? String(row.userId).trim() : '';
  const source = row.source != null ? String(row.source).trim() : '';
  const token = resolveToken(row);
  const s3Key = row.s3Key != null ? String(row.s3Key).trim() : '';

  if (!env || (env !== 'live' && env !== 'sandbox')) {
    throw new MappingError('mapping env must be live|sandbox', 'mapping_bad_env');
  }
  if (!userId) {
    throw new MappingError('mapping userId required', 'mapping_missing_userId');
  }
  if (!source) {
    throw new MappingError('mapping source required', 'mapping_missing_source');
  }
  if (!token) {
    throw new MappingError(
      'mapping token / tokenOrClickRef required',
      'mapping_missing_token',
    );
  }
  if (!s3Key) {
    throw new MappingError('mapping s3Key required', 'mapping_missing_s3Key');
  }

  /** @type {Record<string, unknown>} */
  const out = {
    env,
    userId,
    source,
    tokenOrClickRef: token,
    token,
    s3Key,
  };
  if (row.catalogId != null && String(row.catalogId).trim() !== '') {
    out.catalogId = String(row.catalogId).trim();
  }
  if (row.searchId != null && String(row.searchId).trim() !== '') {
    out.searchId = String(row.searchId).trim();
  }
  if (row.createdAt != null && String(row.createdAt).trim() !== '') {
    out.createdAt = String(row.createdAt).trim();
  }
  if (row.meta != null && typeof row.meta === 'object' && !Array.isArray(row.meta)) {
    out.meta = { ...row.meta };
  } else {
    out.meta = {};
  }
  return out;
}

/**
 * In-memory injectable store for unit tests (FR-054c wires durable store).
 * @returns {{
 *   records: Map<string, object>,
 *   get: (key: string) => Promise<object|null>,
 *   put: (key: string, record: object) => Promise<object>,
 *   listByUserId: (q: object) => Promise<object[]>,
 * }}
 */
function createMemoryMappingStore() {
  /** @type {Map<string, object>} */
  const records = new Map();

  async function get(key) {
    const row = records.get(String(key));
    return row == null ? null : { ...row, meta: { ...(row.meta || {}) } };
  }

  async function put(key, record) {
    const copy = { ...record, meta: { ...(record.meta || {}) } };
    records.set(String(key), copy);
    return { ...copy, meta: { ...copy.meta } };
  }

  /**
   * @param {{ env: string, userId: string, source?: string }} q
   */
  async function listByUserId(q) {
    const env = q && q.env != null ? String(q.env).trim() : '';
    const userId = q && q.userId != null ? String(q.userId).trim() : '';
    const sourceFilter =
      q && q.source != null && String(q.source).trim() !== ''
        ? String(q.source).trim()
        : '';
    /** @type {object[]} */
    const out = [];
    for (const row of records.values()) {
      if (!row || row.env !== env || row.userId !== userId) continue;
      if (sourceFilter && row.source !== sourceFilter) continue;
      out.push({ ...row, meta: { ...(row.meta || {}) } });
    }
    return out;
  }

  return { records, get, put, listByUserId };
}

/**
 * @param {object} deps
 * @returns {{ get: Function, put: Function }}
 */
function requireStore(deps) {
  const store = deps && deps.store;
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function') {
    throw new MappingError(
      'mapping store required (inject deps.store; durable wire is FR-054c)',
      'mapping_missing_store',
    );
  }
  return store;
}

/**
 * Upsert a mapping row by natural key.
 * @param {object} row
 * @param {{ store: { get: Function, put: Function }, now?: () => string }} [deps]
 */
async function upsertMapping(row, deps = {}) {
  const store = requireStore(deps);
  const normalized = normalizeMapping(row);
  const key = mappingNaturalKey(normalized);
  const existing = await store.get(key);
  const nowFn =
    typeof deps.now === 'function'
      ? deps.now
      : () => new Date().toISOString();

  /** @type {Record<string, unknown>} */
  const next = { ...normalized };
  if (existing && existing.createdAt) {
    next.createdAt = existing.createdAt;
  } else if (!next.createdAt) {
    next.createdAt = nowFn();
  }
  if (existing && existing.meta && typeof existing.meta === 'object') {
    next.meta = { ...existing.meta, ...(normalized.meta || {}) };
  }

  return store.put(key, next);
}

/**
 * Get a mapping row by natural key parts.
 * @param {object} query — env, userId, source, token|tokenOrClickRef
 * @param {{ store: { get: Function, put: Function } }} [deps]
 * @returns {Promise<object|null>}
 */
async function getMapping(query, deps = {}) {
  const store = requireStore(deps);
  if (!query || typeof query !== 'object') {
    throw new MappingError('mapping get query required', 'mapping_invalid');
  }
  const token = resolveToken(query);
  const key = mappingNaturalKey({
    env: query.env,
    userId: query.userId,
    source: query.source,
    tokenOrClickRef: token,
  });
  return store.get(key);
}

/**
 * List mapping rows for performance joins (FR-054e).
 * Returns only rows matching userId + env (optional source filter).
 *
 * @param {{ env: string, userId: string, source?: string }} query
 * @param {{ store: { listByUserId?: Function, get: Function, put: Function } }} [deps]
 * @returns {Promise<object[]>}
 */
async function listMappingsByUserId(query, deps = {}) {
  const store = requireStore(deps);
  if (!query || typeof query !== 'object') {
    throw new MappingError('mapping list query required', 'mapping_invalid');
  }
  const env = query.env != null ? String(query.env).trim() : '';
  const userId = query.userId != null ? String(query.userId).trim() : '';
  if (env !== 'live' && env !== 'sandbox') {
    throw new MappingError('mapping env must be live|sandbox', 'mapping_bad_env');
  }
  if (!userId) {
    throw new MappingError('mapping userId required', 'mapping_missing_userId');
  }
  const source =
    query.source != null && String(query.source).trim() !== ''
      ? String(query.source).trim()
      : undefined;

  if (typeof store.listByUserId !== 'function') {
    throw new MappingError(
      'mapping store.listByUserId required for listMappingsByUserId',
      'mapping_missing_list',
    );
  }

  const rows = await store.listByUserId({ env, userId, source });
  const list = Array.isArray(rows) ? rows : [];
  // Defence in depth: only that userId (+ env) returned.
  return list.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    if (String(row.userId) !== userId) return false;
    if (String(row.env) !== env) return false;
    if (source && String(row.source) !== source) return false;
    return true;
  });
}

module.exports = {
  MappingError,
  mappingNaturalKey,
  normalizeMapping,
  resolveToken,
  createMemoryMappingStore,
  upsertMapping,
  getMapping,
  listMappingsByUserId,
};
