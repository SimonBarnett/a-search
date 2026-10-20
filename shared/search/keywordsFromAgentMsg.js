'use strict';

/**
 * FR #4450 / #4446: agent POST /search fan-out carries `queries` / `exclude`
 * (searches.json shape). Live providers must not ignore those fields and must
 * never fall back to a blank / space / `*:*` Browse query.
 * FR #4563: strip market/currency/postcode residue from q at fan-out time too.
 */

const {
  keywordsOnly,
  normalizeMarketCurrency,
} = require('./cleanSearchQuery');

/**
 * @param {unknown} term
 * @returns {string}
 */
function termText(term) {
  if (typeof term === 'string') return term.trim();
  if (!term || typeof term !== 'object') return '';
  if (typeof term.q === 'string' && term.q.trim()) return term.q.trim();
  if (typeof term.match === 'string' && term.match.trim()) {
    const m = term.match.trim();
    // searches.json exclude often uses "title:spam" — keyword APIs want "spam".
    const colon = m.indexOf(':');
    if (colon > 0 && colon < m.length - 1) return m.slice(colon + 1).trim();
    return m;
  }
  if (typeof term.otherText === 'string' && term.otherText.trim()) {
    return term.otherText.trim();
  }
  return '';
}

/**
 * @param {object|null|undefined} msg
 * @returns {string[]}
 */
function collectQueryTerms(msg) {
  if (!msg || typeof msg !== 'object') return [];
  const out = [];
  if (Array.isArray(msg.queries)) {
    for (const q of msg.queries) {
      const t = termText(q);
      if (t) out.push(t);
    }
  }
  if (!out.length && typeof msg.q === 'string' && msg.q.trim()) {
    out.push(msg.q.trim());
  }
  if (!out.length && Array.isArray(msg.searchterms)) {
    for (const t of msg.searchterms) {
      const s = termText(t);
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * @param {object|null|undefined} msg
 * @returns {string[]}
 */
function collectExcludeTerms(msg) {
  if (!msg || typeof msg !== 'object' || !Array.isArray(msg.exclude)) return [];
  const out = [];
  for (const x of msg.exclude) {
    const t = termText(x);
    if (t) out.push(t);
  }
  return out;
}

/**
 * Build a single keyword string for Browse/Product Search APIs.
 * @param {object|null|undefined} msg
 * @param {{ excludeStyle?: 'minus'|'none' }} [opts]
 * @returns {string} empty string when no usable query (caller must not search blank)
 */
function keywordsFromAgentMsg(msg, opts) {
  const style = (opts && opts.excludeStyle) || 'minus';
  const include = collectQueryTerms(msg);
  if (!include.length) return '';
  const { market, currency } = normalizeMarketCurrency(msg || {});
  const stripMarket = market || (msg && msg.market != null ? String(msg.market) : '');
  const stripCurrency =
    currency || (msg && msg.currency != null ? String(msg.currency) : '');
  const cleaned = include
    .map((t) => keywordsOnly(t, stripMarket, stripCurrency))
    .filter(Boolean);
  if (!cleaned.length) return '';
  let q = cleaned.join(' ');
  if (style === 'minus') {
    for (const t of collectExcludeTerms(msg)) {
      if (/\s/.test(t)) q += ` -"${t.replace(/"/g, '')}"`;
      else q += ` -${t}`;
    }
  }
  return q.trim();
}

module.exports = {
  keywordsFromAgentMsg,
  collectQueryTerms,
  collectExcludeTerms,
  termText,
};
