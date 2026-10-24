'use strict';

function isExcluded(part, exclude) {
  if (!part || !Array.isArray(exclude) || !exclude.length) return false;
  const partId = part.partNumber != null ? String(part.partNumber) : '';
  const title = part.title != null ? String(part.title).toLowerCase() : '';
  for (const rule of exclude) {
    if (!rule || typeof rule !== 'object') continue;
    if (rule.partId != null && String(rule.partId) === partId) return true;
    if (rule.match != null && String(rule.match).trim()) {
      if (wholeWord(title, rule.match)) return true;
    }
  }
  return false;
}

function wholeWord(hay, needle) {
  const m = String(needle || '').trim().toLowerCase();
  if (m.length < 3) return false;
  const re = new RegExp(
    `(?:^|[^a-z0-9])${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^a-z0-9]|$)`,
    'i',
  );
  return re.test(String(hay || ''));
}

function partBlob(part) {
  return [
    part && part.title,
    part && part.partNumber,
    part && part.id,
    part && part.merchant,
    part && part.brand,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hostPageExcludes(host, page) {
  const now = new Date().toISOString();
  const rows = [];
  for (const match of (host && host.exclusions) || []) {
    if (String(match).trim().length >= 3) {
      rows.push({ match: String(match).trim(), reason: 'host', at: now });
    }
  }
  const pageEx = (page && page.selection && page.selection.page_exclusions) || [];
  for (const match of pageEx) {
    if (String(match).trim().length >= 3) {
      rows.push({ match: String(match).trim(), reason: 'page', at: now });
    }
  }
  return rows;
}

function matchesAny(blob, list) {
  return (list || []).some((t) => wholeWord(blob, t) || blob.includes(String(t).toLowerCase()));
}

function inPriceBand(part, band, hostCurrency) {
  if (!band || band.min == null && band.max == null) return true;
  const currency = String((part && part.currency) || '').toUpperCase();
  const want = String(band.currency || hostCurrency || '').toUpperCase();
  if (want && currency && currency !== want) return true;
  const price = part && part.price != null ? Number(part.price) : NaN;
  if (!Number.isFinite(price)) return true;
  if (band.min != null && Number.isFinite(Number(band.min)) && price < Number(band.min)) {
    return false;
  }
  if (band.max != null && Number.isFinite(Number(band.max)) && Number(band.max) > 0 && price > Number(band.max)) {
    return false;
  }
  return true;
}

function pageRankBoost(part, page) {
  const blob = partBlob(part);
  const sel = (page && page.selection) || {};
  let boost = 0;
  for (const m of sel.models || []) {
    const sku = String((m && m.sku) || '').toLowerCase();
    const model = String((m && m.model) || '').toLowerCase();
    if (sku && blob.includes(sku)) boost += 40;
    else if (model && blob.includes(model)) boost += 25;
  }
  for (const b of sel.brands || []) {
    if (wholeWord(blob, b) || blob.includes(String(b).toLowerCase())) boost += 10;
  }
  for (const n of sel.nice_to_have || []) {
    if (wholeWord(blob, n) || blob.includes(String(n).toLowerCase())) boost += 4;
  }
  for (const h of sel.ranking_hints || []) {
    if (String(h).toLowerCase().includes('sku') && (sel.models || []).some((m) => m.sku && blob.includes(String(m.sku).toLowerCase()))) {
      boost += 8;
    }
  }
  return boost;
}

/**
 * Filter + score IN/live parts using page+host JSON. Legacy: no page => pass through.
 * @param {object[]} parts
 * @param {{ page?: object, host?: object }} [ctx]
 */
function filterPartsByPage(parts, ctx) {
  const page = ctx && ctx.page;
  const host = ctx && ctx.host;
  if (!page || page.schema !== 'aclubs.page.v1') return parts || [];
  const exclude = hostPageExcludes(host, page);
  const sel = page.selection || {};
  const out = [];
  for (const part of parts || []) {
    if (isExcluded(part, exclude)) continue;
    if (!inPriceBand(part, sel.price_band, host && host.market && host.market.currency)) {
      continue;
    }
    const blob = partBlob(part);
    const types = sel.product_types || [];
    const must = sel.must_have || [];
    if (types.length && !matchesAny(blob, types)) continue;
    if (must.length && !must.every((t) => wholeWord(blob, t) || blob.includes(String(t).toLowerCase()))) {
      continue;
    }
    out.push({
      ...part,
      score: (Number.isFinite(Number(part.score)) ? Number(part.score) : 0) + pageRankBoost(part, page),
    });
  }
  return out;
}

module.exports = {
  hostPageExcludes,
  filterPartsByPage,
  pageRankBoost,
  inPriceBand,
};
