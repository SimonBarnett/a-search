'use strict';

/**
 * FR #4318 / #4563: product keywords only in q.
 * Market, currency, postcodes and town/location parentheticals stay out of q.
 */

const CURRENCY_CODES = /\b(?:GBP|USD|EUR|AUD|CAD|JPY|CHF|NZD|SEK|NOK|DKK|PLN|INR)\b/gi;
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi;

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * FR #4788: keep short product codes in parentheses (RTF, BNF, PNP, kit);
 * drop location / TLD blobs (Lathom, Ormskirk, L40 4BA; .co.uk).
 * @param {string} inner
 * @returns {string} replacement (spaces around kept tokens)
 */
function parentheticalToKeywords(inner) {
  const s = String(inner || '').trim();
  if (!s) return ' ';
  // Location / TLD blobs: commas, postcodes, co.uk, named UK places.
  if (
    /[,;]/.test(s) ||
    /\.co\.uk/i.test(s) ||
    /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(s) ||
    /united\s+kingdom|\buk\b|lathom|ormskirk|england|scotland|wales/i.test(s)
  ) {
    return ' ';
  }
  // Short product codes / compact tokens: (RTF), (BNF), (PNP), (kit), (ARF)
  if (/^[A-Za-z0-9][A-Za-z0-9/+.-]{0,15}$/.test(s)) {
    return ` ${s} `;
  }
  // Unknown longer parentheticals stay out of q (same as pre-#4788 drop).
  return ' ';
}

/**
 * @param {string} text
 * @param {string} [market]
 * @param {string} [currency]
 * @returns {string}
 */
function keywordsOnly(text, market, currency) {
  let q = String(text || '');
  // FR #4563 / #4788: location parentheticals out; short product codes kept.
  q = q.replace(/\(([^)]*)\)/g, (_, inner) => parentheticalToKeywords(inner));
  for (const phrase of [market, currency]) {
    const p = String(phrase || '').trim();
    if (p.length < 2) continue;
    const escaped = escapeRegExp(p);
    const re =
      /\s|[()]/.test(p) || p.length > 3
        ? new RegExp(escaped, 'ig')
        : new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:[^A-Za-z0-9]|$)`, 'ig');
    q = q.replace(re, ' ');
  }
  q = q.replace(/\bUnited\s+Kingdom\b/gi, ' ');
  q = q.replace(/(?:^|[^A-Za-z0-9])UK(?:[^A-Za-z0-9]|$)/gi, ' ');
  q = q.replace(UK_POSTCODE, ' ');
  q = q.replace(CURRENCY_CODES, ' ');
  q = q.replace(/[;,.]+/g, ' ');
  q = q.replace(/\bco\.uk\b/gi, ' ');
  return q.replace(/\s+/g, ' ').trim();
}

function looksUk(text) {
  const s = String(text || '');
  // Clone the postcode pattern — the module-level /g RegExp must not share lastIndex.
  return (
    /united\s+kingdom|\buk\b|lathom|ormskirk|\.co\.uk|england|scotland|wales/i.test(
      s,
    ) || /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(s)
  );
}

/**
 * Normalize steering / body market+currency to short codes (FR #4563: market e.g. GB).
 * @param {{ market?: unknown, currency?: unknown }} [src]
 * @returns {{ market: string, currency: string }}
 */
function normalizeMarketCurrency(src) {
  const raw = src && typeof src === 'object' ? src : {};
  let market = raw.market != null ? String(raw.market).trim() : '';
  let currency = raw.currency != null ? String(raw.currency).trim().toUpperCase() : '';

  const blob = `${market} ${currency}`;
  if (!currency) {
    const m = /\b(GBP|USD|EUR|AUD|CAD)\b/i.exec(blob);
    if (m) currency = m[1].toUpperCase();
  }

  if (looksUk(market) || (!market && currency === 'GBP')) {
    market = 'GB';
  } else if (/united\s+states|\busa\b|(?:^|[^A-Za-z])US(?:[^A-Za-z]|$)/i.test(market)) {
    market = 'US';
  } else if (/^gb$|^uk$/i.test(market)) {
    market = 'GB';
  } else if (/^us$|^usa$/i.test(market)) {
    market = 'US';
  } else if (market.length > 8 && !/^[A-Z]{2}$/i.test(market)) {
    if (currency === 'GBP') market = 'GB';
    else if (currency === 'USD') market = 'US';
    else if (currency === 'EUR') market = 'EU';
  }

  return { market, currency };
}

/**
 * Map normalized market to eBay Browse marketplace id.
 * @param {string} market
 * @param {string} [fallback]
 */
function ebayMarketplaceFromMarket(market, fallback) {
  const m = String(market || '')
    .trim()
    .toUpperCase();
  const map = {
    GB: 'EBAY_GB',
    UK: 'EBAY_GB',
    US: 'EBAY_US',
    DE: 'EBAY_DE',
    FR: 'EBAY_FR',
    IT: 'EBAY_IT',
    ES: 'EBAY_ES',
    AU: 'EBAY_AU',
    CA: 'EBAY_CA',
  };
  if (map[m]) return map[m];
  return fallback != null && String(fallback).trim()
    ? String(fallback).trim()
    : 'EBAY_GB';
}

module.exports = {
  keywordsOnly,
  parentheticalToKeywords,
  normalizeMarketCurrency,
  ebayMarketplaceFromMarket,
  escapeRegExp,
  looksUk,
};
