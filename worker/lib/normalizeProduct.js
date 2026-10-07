'use strict';

/**
 * Shared product result schema (FR-042).
 * Providers map vendor payloads into this shape before writeResults.
 */

const REQUIRED_FIELDS = ['id', 'title', 'source'];

class ProductSchemaError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   */
  constructor(message, code = 'product_schema') {
    super(message);
    this.name = 'ProductSchemaError';
    this.code = code;
  }
}

/**
 * @param {unknown} product
 * @throws {ProductSchemaError}
 */
function assertProductSchema(product) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new ProductSchemaError('product must be a non-null object');
  }
  for (const field of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(product, field)) {
      throw new ProductSchemaError(`missing required field: ${field}`);
    }
    if (product[field] == null) {
      throw new ProductSchemaError(`required field ${field} is null`);
    }
  }
}

/**
 * Build a canonical product object from a partial field map.
 * @param {object} fields
 * @returns {object}
 */
function normalizeProduct(fields) {
  if (!fields || typeof fields !== 'object') {
    return { id: '', title: '', source: '' };
  }

  const priceRaw = fields.price;
  let price;
  if (priceRaw != null && String(priceRaw).trim() !== '') {
    const n = Number(priceRaw);
    price = Number.isFinite(n) ? n : undefined;
  }

  /** @type {Record<string, unknown>} */
  const out = {
    id: fields.id != null ? String(fields.id) : '',
    title: fields.title != null ? String(fields.title) : '',
    source: fields.source != null ? String(fields.source) : '',
  };

  if (fields.url != null) out.url = String(fields.url);
  if (price !== undefined) out.price = price;
  if (fields.currency != null) out.currency = String(fields.currency);
  if (fields.imageUrl != null) out.imageUrl = String(fields.imageUrl);
  if (fields.raw !== undefined) out.raw = fields.raw;

  return out;
}

module.exports = {
  REQUIRED_FIELDS,
  ProductSchemaError,
  assertProductSchema,
  normalizeProduct,
};
