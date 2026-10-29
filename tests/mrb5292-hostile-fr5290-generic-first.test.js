'use strict';

/**
 * docs/mrb-5292 hostile pins for FR #5290 / PR #5292.
 * Generic rows and product_types stay ahead of model/SKU extras at free cap 3.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSearchesDoc,
  isGenericSearchQuery,
  orderQueriesGenericFirst,
} = require('../redqueen/src/guidSearch');
const { examplePageV1, validatePageAnnotation } = require('../redqueen/src/annotationSchemas');

describe('docs/mrb-5292 hostile FR #5290', () => {
  it('examplePageV1 through buildSearchesDoc free cap keeps a generic q', () => {
    const { doc, cap } = buildSearchesDoc({
      page: examplePageV1(),
      host: { market: { country: 'GB', currency: 'GBP' } },
      fullTier: false,
      existing: { queries: [], exclude: [] },
      now: '2026-10-29T08:24:00.000Z',
    });
    assert.equal(cap, 3);
    assert.ok(doc.queries.some(isGenericSearchQuery), JSON.stringify(doc.queries));
    const joined = doc.queries.map((q) => q.q).join(' | ');
    assert.doesNotMatch(joined, /United Kingdom/i);
    assert.doesNotMatch(joined, /\bGBP\b/);
  });

  it('product_types survive cap 3 when every page search_query is model/SKU', () => {
    const { doc } = buildSearchesDoc({
      page: examplePageV1({
        search_queries: [
          {
            q: 'VOLANTEXRC 761-14',
            intent: 'page',
            maxResults: 10,
            brand: 'VOLANTEXRC',
            model: 'Sport Cub S2',
            sku: '761-14',
          },
          {
            q: 'HobbyZone HBZ444000',
            intent: 'page',
            maxResults: 10,
            brand: 'HobbyZone',
            model: 'Sport Cub S 2',
            sku: 'HBZ444000',
          },
        ],
        selection: {
          ...examplePageV1().selection,
          product_types: ['RC plane', 'servo', 'propeller'],
        },
      }),
      host: { market: { country: 'GB', currency: 'GBP' } },
      fullTier: false,
      existing: { queries: [], exclude: [] },
      now: '2026-10-29T08:24:00.000Z',
    });
    assert.equal(doc.queries.length, 3);
    const generics = doc.queries.filter(isGenericSearchQuery);
    assert.ok(generics.length >= 1, JSON.stringify(doc.queries));
    assert.match(generics.map((r) => r.q).join(' | '), /RC plane|servo|propeller/);
  });

  it('brand-only row counts as generic (no model/sku)', () => {
    assert.equal(isGenericSearchQuery({ q: 'E-flite park flyer', brand: 'E-flite' }), true);
    const ordered = orderQueriesGenericFirst(
      [{ q: 'E-flite park flyer', brand: 'E-flite' }],
      [],
      [{ q: 'HBZ444000', sku: 'HBZ444000', model: 'Sport Cub', brand: 'HobbyZone' }],
    );
    assert.equal(ordered[0].q, 'E-flite park flyer');
    assert.equal(ordered[1].sku, 'HBZ444000');
  });

  it('validatePageAnnotation still fails when only sku rows exist', () => {
    const v = validatePageAnnotation(
      examplePageV1({
        search_queries: [
          {
            q: '761-14',
            intent: 'page',
            maxResults: 10,
            sku: '761-14',
            model: 'Sport Cub S2',
          },
        ],
      }),
    );
    assert.equal(v.ok, false);
  });
});
