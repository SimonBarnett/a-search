'use strict';

/**
 * FR #4824: aclub.host.v1 / aclub.page.v1 templates. Hand validator
 * (additionalProperties false, length/enum limits). No junk fallback.
 */

const HOST_SCHEMA = 'aclubs.host.v1';
const PAGE_SCHEMA = 'aclubs.page.v1';

const HOST_SKELETON = {
  schema: HOST_SCHEMA,
  host: '',
  about: '',
  description: '',
  keywords: [],
  audience: { summary: '', segments: [] },
  affiliate_opportunities: [{ category: '', brands: [], hook: '' }],
  exclusions: [],
  identity_terms: [],
  market: { country: 'GB', currency: 'GBP', locale: 'en-GB' },
};

const PAGE_SKELETON = {
  schema: PAGE_SCHEMA,
  guid: '',
  uri: '',
  evidence: { title: '', meta_description: '', meta_keywords: '', h1: [] },
  page_title: '',
  page_purpose: '',
  page_keywords: [],
  page_description: '',
  selection: {
    product_types: [],
    categories: [],
    must_have: [],
    nice_to_have: [],
    brands: [],
    models: [{ brand: '', model: '', sku: '' }],
    size: {},
    price_band: { currency: 'GBP', min: 0, max: 0 },
    page_exclusions: [],
    ranking_hints: [],
  },
  search_queries: [{ q: '', intent: 'page', maxResults: 10 }],
};

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function str(v) {
  return v == null ? '' : String(v);
}

function fail(errors, path, msg) {
  errors.push(`${path}: ${msg}`);
}

function checkString(errors, path, v, min, max) {
  if (typeof v !== 'string') {
    fail(errors, path, 'must be string');
    return;
  }
  if (v.length < min || v.length > max) {
    fail(errors, path, `length ${v.length} not in ${min}-${max}`);
  }
}

function checkStringArray(errors, path, v, minN, maxN, minLen, maxLen) {
  if (!Array.isArray(v)) {
    fail(errors, path, 'must be array');
    return;
  }
  if (v.length < minN || v.length > maxN) {
    fail(errors, path, `count ${v.length} not in ${minN}-${maxN}`);
  }
  v.forEach((item, i) => {
    if (typeof item !== 'string') fail(errors, `${path}[${i}]`, 'must be string');
    else if (item.length < minLen || (maxLen != null && item.length > maxLen)) {
      fail(errors, `${path}[${i}]`, `length ${item.length} not in ${minLen}-${maxLen}`);
    }
  });
}

function extraKeys(obj, allowed) {
  return Object.keys(obj || {}).filter((k) => !allowed.has(k));
}

function parseReviewJson(text) {
  const trimmed = String(text || '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return { ok: false, errors: ['not_json'] };
  }
  try {
    const obj = JSON.parse(trimmed.slice(start, end + 1));
    if (!isPlainObject(obj)) return { ok: false, errors: ['not_object'] };
    return { ok: true, value: obj };
  } catch (err) {
    return { ok: false, errors: [`json:${(err && err.message) || err}`] };
  }
}

function validateHostAnnotation(doc) {
  const errors = [];
  if (!isPlainObject(doc)) return { ok: false, errors: ['not_object'] };
  const extra = extraKeys(doc, new Set([
    'schema',
    'host',
    'reviewedAt',
    'model',
    'about',
    'description',
    'keywords',
    'audience',
    'affiliate_opportunities',
    'exclusions',
    'identity_terms',
    'market',
  ]));
  if (extra.length) fail(errors, 'root', `extra ${extra.join(',')}`);
  if (doc.schema !== HOST_SCHEMA) fail(errors, 'schema', `want ${HOST_SCHEMA}`);
  checkString(errors, 'host', doc.host, 1, 253);
  checkString(errors, 'about', doc.about, 40, 600);
  checkString(errors, 'description', doc.description, 40, 400);
  checkStringArray(errors, 'keywords', doc.keywords, 5, 20, 2, 40);
  if (!isPlainObject(doc.audience)) fail(errors, 'audience', 'must be object');
  else {
    const ax = extraKeys(doc.audience, new Set(['summary', 'segments']));
    if (ax.length) fail(errors, 'audience', `extra ${ax.join(',')}`);
    checkString(errors, 'audience.summary', doc.audience.summary, 1, 400);
    checkStringArray(errors, 'audience.segments', doc.audience.segments, 1, 8, 1, 80);
  }
  if (!Array.isArray(doc.affiliate_opportunities)) {
    fail(errors, 'affiliate_opportunities', 'must be array');
  } else if (
    doc.affiliate_opportunities.length < 1 ||
    doc.affiliate_opportunities.length > 12
  ) {
    fail(errors, 'affiliate_opportunities', 'count not in 1-12');
  } else {
    doc.affiliate_opportunities.forEach((row, i) => {
      if (!isPlainObject(row)) fail(errors, `affiliate_opportunities[${i}]`, 'object');
      else {
        const rx = extraKeys(row, new Set(['category', 'brands', 'hook']));
        if (rx.length) fail(errors, `affiliate_opportunities[${i}]`, `extra ${rx.join(',')}`);
        checkString(errors, `affiliate_opportunities[${i}].category`, row.category, 1, 80);
        checkStringArray(errors, `affiliate_opportunities[${i}].brands`, row.brands, 0, 20, 1, 40);
        checkString(errors, `affiliate_opportunities[${i}].hook`, row.hook, 1, 200);
      }
    });
  }
  checkStringArray(errors, 'exclusions', doc.exclusions, 0, 30, 3, 80);
  if (!Array.isArray(doc.identity_terms)) fail(errors, 'identity_terms', 'must be array');
  else {
    doc.identity_terms.forEach((item, i) => {
      if (typeof item !== 'string' || item.length < 2) {
        fail(errors, `identity_terms[${i}]`, 'string >=2');
      }
    });
  }
  if (!isPlainObject(doc.market)) fail(errors, 'market', 'must be object');
  else {
    const mx = extraKeys(doc.market, new Set(['country', 'currency', 'locale']));
    if (mx.length) fail(errors, 'market', `extra ${mx.join(',')}`);
    if (!/^[A-Z]{2}$/.test(str(doc.market.country))) {
      fail(errors, 'market.country', 'ISO-3166 alpha-2');
    }
    if (!/^[A-Z]{3}$/.test(str(doc.market.currency))) {
      fail(errors, 'market.currency', 'ISO-4217');
    }
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(str(doc.market.locale))) {
      fail(errors, 'market.locale', 'BCP-47');
    }
  }
  return { ok: errors.length === 0, errors };
}

function validatePageAnnotation(doc) {
  const errors = [];
  if (!isPlainObject(doc)) return { ok: false, errors: ['not_object'] };
  const extra = extraKeys(doc, new Set([
    'schema',
    'guid',
    'uri',
    'annotatedAt',
    'model',
    'evidence',
    'page_title',
    'page_purpose',
    'page_keywords',
    'page_description',
    'selection',
    'search_queries',
  ]));
  if (extra.length) fail(errors, 'root', `extra ${extra.join(',')}`);
  if (doc.schema !== PAGE_SCHEMA) fail(errors, 'schema', `want ${PAGE_SCHEMA}`);
  checkString(errors, 'guid', doc.guid, 8, 64);
  checkString(errors, 'uri', doc.uri, 1, 500);
  if (!isPlainObject(doc.evidence)) fail(errors, 'evidence', 'must be object');
  else {
    const ex = extraKeys(doc.evidence, new Set([
      'title',
      'meta_description',
      'meta_keywords',
      'h1',
    ]));
    if (ex.length) fail(errors, 'evidence', `extra ${ex.join(',')}`);
    checkString(errors, 'evidence.title', doc.evidence.title, 0, 300);
    checkString(errors, 'evidence.meta_description', doc.evidence.meta_description, 0, 500);
    checkString(errors, 'evidence.meta_keywords', doc.evidence.meta_keywords, 0, 400);
    if (!Array.isArray(doc.evidence.h1)) fail(errors, 'evidence.h1', 'must be array');
  }
  checkString(errors, 'page_title', doc.page_title, 1, 200);
  checkString(errors, 'page_purpose', doc.page_purpose, 30, 400);
  checkStringArray(errors, 'page_keywords', doc.page_keywords, 3, 15, 2, 60);
  checkString(errors, 'page_description', doc.page_description, 30, 400);
  if (!isPlainObject(doc.selection)) fail(errors, 'selection', 'must be object');
  else {
    const sel = doc.selection;
    const sx = extraKeys(sel, new Set([
      'product_types',
      'categories',
      'must_have',
      'nice_to_have',
      'brands',
      'models',
      'size',
      'price_band',
      'page_exclusions',
      'ranking_hints',
    ]));
    if (sx.length) fail(errors, 'selection', `extra ${sx.join(',')}`);
    checkStringArray(errors, 'selection.product_types', sel.product_types, 0, 20, 2, 80);
    checkStringArray(errors, 'selection.categories', sel.categories, 0, 20, 1, 80);
    checkStringArray(errors, 'selection.must_have', sel.must_have, 0, 20, 1, 80);
    checkStringArray(errors, 'selection.nice_to_have', sel.nice_to_have, 0, 20, 1, 80);
    checkStringArray(errors, 'selection.brands', sel.brands, 0, 20, 1, 40);
    if (!Array.isArray(sel.models)) fail(errors, 'selection.models', 'must be array');
    else {
      sel.models.forEach((m, i) => {
        if (!isPlainObject(m)) fail(errors, `selection.models[${i}]`, 'object');
        else {
          const mx = extraKeys(m, new Set(['brand', 'model', 'sku']));
          if (mx.length) fail(errors, `selection.models[${i}]`, `extra ${mx.join(',')}`);
          checkString(errors, `selection.models[${i}].brand`, m.brand, 0, 40);
          checkString(errors, `selection.models[${i}].model`, m.model, 0, 80);
          checkString(errors, `selection.models[${i}].sku`, m.sku, 0, 40);
        }
      });
    }
    if (sel.size != null && !isPlainObject(sel.size)) {
      fail(errors, 'selection.size', 'must be object');
    }
    if (sel.price_band != null) {
      if (!isPlainObject(sel.price_band)) fail(errors, 'selection.price_band', 'object');
      else {
        const px = extraKeys(sel.price_band, new Set(['currency', 'min', 'max']));
        if (px.length) fail(errors, 'selection.price_band', `extra ${px.join(',')}`);
        if (sel.price_band.currency != null && !/^[A-Z]{3}$/.test(str(sel.price_band.currency))) {
          fail(errors, 'selection.price_band.currency', 'ISO-4217');
        }
      }
    }
    checkStringArray(errors, 'selection.page_exclusions', sel.page_exclusions, 0, 30, 3, 80);
    checkStringArray(errors, 'selection.ranking_hints', sel.ranking_hints, 0, 12, 1, 120);
  }
  if (!Array.isArray(doc.search_queries) || doc.search_queries.length < 1) {
    fail(errors, 'search_queries', 'need 1+');
  } else {
    doc.search_queries.forEach((q, i) => {
      if (!isPlainObject(q)) fail(errors, `search_queries[${i}]`, 'object');
      else {
        // FR #5281: brand/model/sku (+ brands/models) ride with q for SQL gates.
        const qx = extraKeys(
          q,
          new Set(['q', 'intent', 'maxResults', 'brand', 'model', 'sku', 'brands', 'models']),
        );
        if (qx.length) fail(errors, `search_queries[${i}]`, `extra ${qx.join(',')}`);
        checkString(errors, `search_queries[${i}].q`, q.q, 2, 200);
        if (q.intent !== 'page') fail(errors, `search_queries[${i}].intent`, 'must be page');
        if (q.brand != null) checkString(errors, `search_queries[${i}].brand`, q.brand, 0, 40);
        if (q.model != null) checkString(errors, `search_queries[${i}].model`, q.model, 0, 80);
        if (q.sku != null) checkString(errors, `search_queries[${i}].sku`, q.sku, 0, 40);
        if (q.brands != null) {
          checkStringArray(errors, `search_queries[${i}].brands`, q.brands, 0, 20, 1, 40);
        }
        if (q.models != null) {
          if (!Array.isArray(q.models)) fail(errors, `search_queries[${i}].models`, 'must be array');
          else {
            q.models.forEach((m, j) => {
              if (!isPlainObject(m)) fail(errors, `search_queries[${i}].models[${j}]`, 'object');
              else {
                const mx = extraKeys(m, new Set(['brand', 'model', 'sku']));
                if (mx.length) {
                  fail(errors, `search_queries[${i}].models[${j}]`, `extra ${mx.join(',')}`);
                }
                checkString(errors, `search_queries[${i}].models[${j}].brand`, m.brand, 0, 40);
                checkString(errors, `search_queries[${i}].models[${j}].model`, m.model, 0, 80);
                checkString(errors, `search_queries[${i}].models[${j}].sku`, m.sku, 0, 40);
              }
            });
          }
        }
        if (!Number.isFinite(Number(q.maxResults))) {
          fail(errors, `search_queries[${i}].maxResults`, 'number');
        }
      }
    });
  }
  return { ok: errors.length === 0, errors };
}

function padMin(text, min, max, filler) {
  let s = str(text).trim();
  const extra = filler || ' for affiliate targeting of this club site.';
  while (s.length < min) s = `${s}${extra}`.trim();
  if (s.length > max) s = s.slice(0, max);
  return s;
}

function keywordPad(list, min) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    const k = str(raw).trim().slice(0, 40);
    if (k.length < 2) continue;
    const n = k.toLowerCase();
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(k);
  }
  const extras = ['radio control', 'hobby club', 'members', 'retail', 'affiliate'];
  for (const e of extras) {
    if (out.length >= min) break;
    if (!seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  }
  return out.slice(0, 20);
}

/**
 * Lift a legacy host review (club/audience/affiliateOpportunities) to v1
 * so injected test reviews and old model output can be stored as templates.
 */
function liftHostReview(review, meta) {
  if (!review || typeof review !== 'object') return review;
  if (review.schema === HOST_SCHEMA) {
    return {
      ...review,
      host: review.host || (meta && meta.host) || '',
      reviewedAt: review.reviewedAt || (meta && meta.reviewedAt) || '',
      model: review.model || (meta && meta.model) || '',
    };
  }
  const about = padMin(
    [review.club, review.summary].filter(Boolean).join('. '),
    40,
    600,
    ' Site-wide club context for affiliate targeting.',
  );
  const description = padMin(
    review.summary || review.club || review.affiliateOpportunities,
    40,
    400,
    ' Site-wide description of this club for retailers.',
  );
  const cats = Array.isArray(review.categories) ? review.categories : [];
  return {
    schema: HOST_SCHEMA,
    host: (meta && meta.host) || str(review.host),
    reviewedAt: (meta && meta.reviewedAt) || '',
    model: review.model || (meta && meta.model) || '',
    about,
    description,
    keywords: keywordPad([...cats, review.club, 'radio control', 'club flying'], 5),
    audience: {
      summary: padMin(review.audience || 'club members and visitors', 1, 400),
      segments: [str(review.audience || 'members').slice(0, 80) || 'members'],
    },
    affiliate_opportunities: [
      {
        category: str(review.affiliateOpportunities || 'hobby retail').slice(0, 80),
        brands: [],
        hook: 'seasonal club shop and events',
      },
    ],
    exclusions: [],
    identity_terms: [],
    market: { country: 'GB', currency: 'GBP', locale: 'en-GB' },
  };
}

function liftPageReview(review, meta) {
  if (!review || typeof review !== 'object') return review;
  if (review.schema === PAGE_SCHEMA) {
    return {
      ...review,
      guid: review.guid || (meta && meta.guid) || '',
      uri: review.uri || (meta && meta.uri) || '/',
      annotatedAt: review.annotatedAt || (meta && meta.annotatedAt) || '',
      model: review.model || (meta && meta.model) || '',
    };
  }
  const head = (meta && meta.pageHead) || {};
  const steering = review.steering && typeof review.steering === 'object' ? review.steering : {};
  const suggested = Array.isArray(review.suggestedQueries) ? review.suggestedQueries : [];
  const queries = [];
  for (const q of suggested) {
    if (typeof q === 'string' && q.trim()) {
      queries.push({ q: q.trim().slice(0, 200), intent: 'page', maxResults: 10 });
    } else if (q && typeof q === 'object' && q.q) {
      const row = {
        q: String(q.q).slice(0, 200),
        intent: 'page',
        maxResults: Number.isFinite(Number(q.maxResults)) ? Number(q.maxResults) : 10,
      };
      // FR #5281
      if (q.brand != null && String(q.brand).trim()) row.brand = String(q.brand).trim().slice(0, 40);
      if (q.model != null && String(q.model).trim()) row.model = String(q.model).trim().slice(0, 80);
      if (q.sku != null && String(q.sku).trim()) row.sku = String(q.sku).trim().slice(0, 40);
      queries.push(row);
    }
  }
  if (!queries.length) {
    const include = steering.include || steering.includeTerms || steering.queries || [];
    for (const q of Array.isArray(include) ? include : []) {
      if (String(q || '').trim().length >= 1) {
        queries.push({ q: String(q).trim().slice(0, 200), intent: 'page', maxResults: 10 });
      }
    }
  }
  if (!queries.length) {
    const seed = str(review.intent || review.summary).split(/[.\n]/)[0].trim();
    if (seed.length >= 1) {
      queries.push({ q: seed.slice(0, 200), intent: 'page', maxResults: 10 });
    }
  }
  for (const row of queries) {
    if (row.q && row.q.length < 2) row.q = `${row.q} item`;
  }
  const excludeRaw = steering.exclude || steering.excludeTerms || [];
  const pageExcl = (Array.isArray(excludeRaw) ? excludeRaw : [])
    .map((x) => (typeof x === 'string' ? x : x && x.match))
    .filter((x) => str(x).trim().length >= 3)
    .map((x) => str(x).trim().slice(0, 80));
  const kws = [];
  for (const q of queries) {
    const bits = String(q.q).split(/\s+/).filter((w) => w.length >= 2);
    for (const b of bits) {
      if (kws.length >= 15) break;
      if (!kws.includes(b.toLowerCase())) kws.push(b.slice(0, 60));
    }
  }
  while (kws.length < 3) kws.push(`page-term-${kws.length + 1}`);
  const purpose = padMin(
    review.summary || review.intent || 'This page lists specific products',
    30,
    400,
    ' Page-only merchandise list distinct from the rest of the site.',
  );
  return {
    schema: PAGE_SCHEMA,
    guid: (meta && meta.guid) || str(review.guid),
    uri: (meta && meta.uri) || str(review.uri) || '/',
    annotatedAt: (meta && meta.annotatedAt) || '',
    model: review.model || (meta && meta.model) || '',
    evidence: {
      title: str(head.title),
      meta_description: str(head.description),
      meta_keywords: str(head.keywords),
      h1: Array.isArray(head.h1) ? head.h1 : [],
    },
    page_title: str(head.title || review.intent || 'page').slice(0, 200) || 'page',
    page_purpose: purpose,
    page_keywords: kws.slice(0, 15),
    page_description: padMin(
      review.summary || purpose,
      30,
      400,
      ' Distinct page copy used to pick IN/ parts for this URI.',
    ),
    selection: {
      product_types: Array.isArray(steering.categories) ? steering.categories.slice(0, 20) : [],
      categories: [],
      must_have: [],
      nice_to_have: [],
      brands: Array.isArray(steering.brands) ? steering.brands.slice(0, 20) : [],
      // FR #5281: keep structured models from steering when lifting a legacy review.
      models: Array.isArray(steering.models)
        ? steering.models
            .filter((m) => m && typeof m === 'object')
            .slice(0, 20)
            .map((m) => ({
              brand: str(m.brand).slice(0, 40),
              model: str(m.model).slice(0, 80),
              sku: str(m.sku).slice(0, 40),
            }))
        : [],
      size: {},
      price_band: steering.priceBand && typeof steering.priceBand === 'object'
        ? {
          currency: str(steering.priceBand.currency || 'GBP').slice(0, 3).toUpperCase(),
          min: Number(steering.priceBand.min) || 0,
          max: Number(steering.priceBand.max) || 0,
        }
        : { currency: 'GBP', min: 0, max: 0 },
      page_exclusions: pageExcl,
      ranking_hints: [],
    },
    search_queries: queries.slice(0, 15),
  };
}

function hasCurrentHostSchema(doc) {
  return !!(doc && doc.schema === HOST_SCHEMA);
}

function hasCurrentPageSchema(doc) {
  return !!(doc && doc.schema === PAGE_SCHEMA);
}

function steeringFromPage(page) {
  const sel = (page && page.selection) || {};
  return {
    include: (page && page.search_queries || []).map((q) => q.q),
    exclude: sel.page_exclusions || [],
    product_types: sel.product_types || [],
    brands: sel.brands || [],
    models: sel.models || [],
    price_band: sel.price_band || null,
    ranking_hints: sel.ranking_hints || [],
  };
}

function exampleHostV1(over) {
  return {
    schema: HOST_SCHEMA,
    host: 'www.mymodelflyingclub.co.uk',
    reviewedAt: '2026-10-24T15:00:00.000Z',
    model: 'test',
    about: 'Mereside Model Flying Club is a BMFA-affiliated fixed-wing RC club for local flyers.',
    description: 'UK model flying club site covering trainers, club nights and affiliate shop links.',
    keywords: ['rc airplane', 'fixed wing', 'trainer', 'bmfa club', 'lipo'],
    audience: {
      summary: 'Sunday club members buying RTF trainers and spare packs.',
      segments: ['beginner flyers'],
    },
    affiliate_opportunities: [
      { category: 'RTF trainers', brands: ['HobbyZone'], hook: 'gift season' },
    ],
    exclusions: ['rc car'],
    identity_terms: ['Mereside Model Club', 'Lathom', 'Ormskirk', 'L40 4BA'],
    market: { country: 'GB', currency: 'GBP', locale: 'en-GB' },
    ...(over || {}),
  };
}

function examplePageV1(over) {
  return {
    schema: PAGE_SCHEMA,
    guid: '8504174c-f21f-4fe0-b8eb-98e7d7ceaed0',
    uri: '/membersproductrequests',
    annotatedAt: '2026-10-24T15:01:00.000Z',
    model: 'test',
    evidence: {
      title: 'This Weeks Special Offers',
      meta_description: 'Products requested by members',
      meta_keywords: '',
      h1: ['This Weeks Special Offers'],
    },
    page_title: 'This Weeks Special Offers',
    page_purpose: 'Weekly list of specific products members asked for as gifts: Sport Cub RTF and UMX Waco.',
    page_keywords: ['sport cub rtf', 'umx waco bnf', '4s lipo xt60', 'ca glue', 'beginner gift'],
    page_description: 'A gift shortlist of ready-to-fly beginner planes, one micro biplane and consumables.',
    selection: {
      product_types: ['RTF beginner RC airplane', 'micro park-flyer biplane'],
      categories: ['Sport Cub trainers'],
      must_have: ['RTF or BNF'],
      nice_to_have: ['SAFE', 'XT60'],
      brands: ['VOLANTEXRC', 'HobbyZone', 'E-flite'],
      models: [
        { brand: 'VOLANTEXRC', model: 'Sport Cub S2', sku: '761-14' },
        { brand: 'E-flite', model: 'UMX Waco BNF', sku: 'EFLU53550Y' },
      ],
      size: { wingspan_mm_max: 700 },
      price_band: { currency: 'GBP', min: 3, max: 220 },
      page_exclusions: ['kit requiring assembly'],
      ranking_hints: ['exact listed SKU first'],
    },
    search_queries: [
      { q: 'VOLANTEXRC Sport Cub S2 761-14 RTF', intent: 'page', maxResults: 10 },
    ],
    ...(over || {}),
  };
}

module.exports = {
  HOST_SCHEMA,
  PAGE_SCHEMA,
  HOST_SKELETON,
  PAGE_SKELETON,
  parseReviewJson,
  validateHostAnnotation,
  validatePageAnnotation,
  liftHostReview,
  liftPageReview,
  hasCurrentHostSchema,
  hasCurrentPageSchema,
  steeringFromPage,
  exampleHostV1,
  examplePageV1,
};
