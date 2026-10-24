'use strict';

/**
 * FR #4824 §4: page JSON must not restated host identity or host topics.
 */

const PAGE_HOST_DESC_JACCARD_MAX = 0.5;
const PAGE_HOST_KEYWORD_NEAR_MAX = 0.4;
const PAGE_EXCL_HOST_COPY_MAX = 0.5;
const SIBLING_JACCARD_MAX = 0.8;
const NEAR_LEVENSHTEIN_MAX = 2;

function normalizeTokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a, b) {
  const ta = a instanceof Set ? a : normalizeTokens(a);
  const tb = b instanceof Set ? b : normalizeTokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  return inter / (ta.size + tb.size - inter);
}

function normPhrase(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  const m = s.length;
  const n = t.length;
  if (Math.abs(m - n) > NEAR_LEVENSHTEIN_MAX) return NEAR_LEVENSHTEIN_MAX + 1;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function nearMatch(a, b) {
  const na = normPhrase(a);
  const nb = normPhrase(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return levenshtein(na, nb) <= NEAR_LEVENSHTEIN_MAX;
}

function containsPhrase(hay, needle) {
  const h = normPhrase(hay);
  const n = normPhrase(needle);
  if (!n || n.length < 2) return false;
  return h.includes(n);
}

function substringPair(a, b) {
  const na = normPhrase(a);
  const nb = normPhrase(b);
  if (!na || !nb) return false;
  if (na.length < 20 && nb.length < 20) return na === nb;
  return na.includes(nb) || nb.includes(na);
}

function dropHostCopiedExclusions(pageExcl, hostExcl) {
  const hostSet = new Set((hostExcl || []).map(normPhrase));
  const kept = [];
  const dropped = [];
  for (const item of pageExcl || []) {
    if (hostSet.has(normPhrase(item))) dropped.push(item);
    else kept.push(item);
  }
  return { kept, dropped };
}

/**
 * @param {object} page
 * @param {object} host
 * @param {{ siblings?: Array<{ uri: string, page: object }> }} [opts]
 */
function pageOverlapsHost(page, host, opts) {
  const reasons = [];
  const p = page || {};
  const h = host || {};
  const fields = [p.page_description, p.page_purpose];
  const hostFields = [h.about, h.description];
  for (const pf of fields) {
    for (const hf of hostFields) {
      if (!pf || !hf) continue;
      if (substringPair(pf, hf) || jaccard(pf, hf) >= PAGE_HOST_DESC_JACCARD_MAX) {
        reasons.push('page_repeats_host_description');
      }
    }
  }
  const pageKw = Array.isArray(p.page_keywords) ? p.page_keywords : [];
  const hostKw = Array.isArray(h.keywords) ? h.keywords : [];
  if (pageKw.length) {
    let near = 0;
    for (const pk of pageKw) {
      if (hostKw.some((hk) => nearMatch(pk, hk))) near += 1;
    }
    if (near / pageKw.length > PAGE_HOST_KEYWORD_NEAR_MAX) {
      reasons.push('page_keywords_repeat_host');
    }
  }
  const sel = p.selection || {};
  const rawEx = Array.isArray(sel.page_exclusions) ? sel.page_exclusions : [];
  const { kept, dropped } = dropHostCopiedExclusions(rawEx, h.exclusions);
  if (rawEx.length && dropped.length / rawEx.length > PAGE_EXCL_HOST_COPY_MAX) {
    reasons.push('page_exclusions_copy_host');
  }
  const hostTopics = [
    ...(h.keywords || []),
    ...((h.affiliate_opportunities || []).map((r) => r && r.category).filter(Boolean)),
  ];
  for (const ex of kept) {
    if (hostTopics.some((t) => nearMatch(ex, t))) {
      reasons.push('page_exclusions_host_topics');
      break;
    }
  }
  const identity = [
    ...(h.identity_terms || []),
    h.market && h.market.country,
    h.market && h.market.currency,
    countryName(h.market && h.market.country),
    currencyName(h.market && h.market.currency),
  ].filter(Boolean);
  const pageTexts = [
    p.page_title,
    p.page_purpose,
    p.page_description,
    ...(p.page_keywords || []),
    ...((p.search_queries || []).map((q) => q && q.q)),
  ];
  for (const term of identity) {
    if (String(term).length < 2) continue;
    if (pageTexts.some((t) => containsPhrase(t, term))) {
      reasons.push('page_contains_host_identity');
      break;
    }
  }
  const siblings = (opts && opts.siblings) || [];
  const myUri = normPhrase(p.uri);
  for (const sib of siblings) {
    if (!sib || !sib.page) continue;
    if (normPhrase(sib.uri || sib.page.uri) === myUri) continue;
    const sk = jaccard((p.page_keywords || []).join(' '), (sib.page.page_keywords || []).join(' '));
    const sm = modelJaccard(sel.models, (sib.page.selection || {}).models);
    if (sk >= SIBLING_JACCARD_MAX && sm >= SIBLING_JACCARD_MAX) {
      reasons.push('page_copies_sibling');
      break;
    }
  }
  const unique = [...new Set(reasons)];
  return {
    ok: unique.length === 0,
    reasons: unique,
    page_exclusions: kept,
  };
}

function modelJaccard(a, b) {
  const keys = (list) =>
    new Set(
      (list || [])
        .map((m) => normPhrase([m && m.brand, m && m.model, m && m.sku].join(' ')))
        .filter(Boolean),
    );
  return jaccard(keys(a), keys(b));
}

function countryName(code) {
  const map = { GB: 'united kingdom', US: 'united states', IE: 'ireland' };
  return map[String(code || '')] || '';
}

function currencyName(code) {
  const map = { GBP: 'pound', USD: 'dollar', EUR: 'euro' };
  return map[String(code || '')] || '';
}

module.exports = {
  PAGE_HOST_DESC_JACCARD_MAX,
  PAGE_HOST_KEYWORD_NEAR_MAX,
  PAGE_EXCL_HOST_COPY_MAX,
  SIBLING_JACCARD_MAX,
  NEAR_LEVENSHTEIN_MAX,
  normalizeTokens,
  jaccard,
  nearMatch,
  dropHostCopiedExclusions,
  pageOverlapsHost,
};
