'use strict';

/**
 * FR #5290: annotator / buildSearchesDoc must keep generic category queries
 * ahead of model/SKU rows so free-tier cap (3) still has catalogue-matchable q.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildSearchesDoc,
  isGenericSearchQuery,
  orderQueriesGenericFirst,
} = require('../redqueen/src/guidSearch');
const {
  examplePageV1,
  validatePageAnnotation,
  PAGE_SKELETON,
} = require('../redqueen/src/annotationSchemas');
const { guidReviewPrompt } = require('../redqueen/src/reviewers');

describe('FR #5290 generic searches.json queries', () => {
  it('isGenericSearchQuery is true without sku/model', () => {
    assert.equal(isGenericSearchQuery({ q: 'RC plane' }), true);
    assert.equal(isGenericSearchQuery({ q: 'paint station', intent: 'page' }), true);
    assert.equal(
      isGenericSearchQuery({
        q: 'VOLANTEXRC Sport Cub',
        brand: 'VOLANTEXRC',
        model: 'Sport Cub S2',
        sku: '761-14',
      }),
      false,
    );
    assert.equal(
      isGenericSearchQuery({ q: 'HobbyZone Sport Cub', model: 'Sport Cub S 2' }),
      false,
    );
  });

  it('examplePageV1 has generic rows beside structured Sport Cub / UMX Waco', () => {
    const page = examplePageV1();
    const v = validatePageAnnotation(page);
    assert.equal(v.ok, true, JSON.stringify(v.errors));
    const generics = (page.search_queries || []).filter(isGenericSearchQuery);
    assert.ok(generics.length >= 2, 'need 2+ generic search_queries');
    const qs = generics.map((r) => String(r.q).toLowerCase()).join(' | ');
    assert.match(qs, /rc plane|rtf trainer|rc aircraft|paint station|servo|propeller/);
    const specific = (page.search_queries || []).filter((r) => !isGenericSearchQuery(r));
    assert.ok(specific.some((r) => /Sport Cub|761-14/i.test(r.q) || r.sku === '761-14'));
    assert.ok(specific.some((r) => /UMX Waco|EFLU53550Y/i.test(r.q) || r.sku === 'EFLU53550Y'));
  });

  it('validatePageAnnotation requires at least one generic search_query', () => {
    const page = examplePageV1({
      search_queries: [
        {
          q: 'VOLANTEXRC Sport Cub S2 761-14',
          intent: 'page',
          maxResults: 10,
          brand: 'VOLANTEXRC',
          model: 'Sport Cub S2',
          sku: '761-14',
        },
      ],
    });
    const v = validatePageAnnotation(page);
    assert.equal(v.ok, false);
    assert.ok(
      (v.errors || []).some((e) => /generic/i.test(String(e))),
      JSON.stringify(v.errors),
    );
  });

  it('buildSearchesDoc at free cap 3 keeps a generic row and drops UK/GBP', () => {
    const page = examplePageV1({
      search_queries: [
        { q: 'RC plane', intent: 'page', maxResults: 10 },
        { q: 'paint station', intent: 'page', maxResults: 10 },
        {
          q: 'VOLANTEXRC Sport Cub S2 3CH RTF Xpilot 761-14 beginner RC plane United Kingdom GBP',
          intent: 'page',
          maxResults: 10,
          brand: 'VOLANTEXRC',
          model: 'Sport Cub S2',
          sku: '761-14',
        },
        {
          q: 'HobbyZone Sport Cub S 2 HBZ444000 United Kingdom GBP',
          intent: 'page',
          maxResults: 10,
          brand: 'HobbyZone',
          model: 'Sport Cub S 2',
          sku: 'HBZ444000',
        },
        {
          q: 'E-flite UMX Waco EFLU53550Y United Kingdom GBP',
          intent: 'page',
          maxResults: 10,
          brand: 'E-flite',
          model: 'UMX Waco',
          sku: 'EFLU53550Y',
        },
      ],
      selection: {
        ...examplePageV1().selection,
        product_types: ['RTF trainer', 'RC aircraft battery'],
        models: [
          { brand: 'VOLANTEXRC', model: 'Sport Cub S2', sku: '761-14' },
          { brand: 'HobbyZone', model: 'Sport Cub S 2', sku: 'HBZ444000' },
          { brand: 'E-flite', model: 'UMX Waco', sku: 'EFLU53550Y' },
        ],
      },
    });
    const { doc, cap } = buildSearchesDoc({
      page,
      host: { market: { country: 'GB', currency: 'GBP' } },
      fullTier: false,
      existing: { queries: [], exclude: [] },
      now: '2026-10-29T08:20:00.000Z',
    });
    assert.equal(cap, 3);
    assert.equal(doc.queries.length, 3);
    const generics = doc.queries.filter(isGenericSearchQuery);
    assert.ok(generics.length >= 1, JSON.stringify(doc.queries));
    const joined = doc.queries.map((q) => q.q).join(' | ');
    assert.doesNotMatch(joined, /United Kingdom/i);
    assert.doesNotMatch(joined, /\bGBP\b/);
    assert.match(joined, /RC plane|paint station|RTF trainer|RC aircraft battery/i);
  });

  it('orderQueriesGenericFirst puts product_types ahead of model rows', () => {
    const ordered = orderQueriesGenericFirst(
      [
        { q: 'SKU only', sku: '761-14', model: 'Sport Cub', brand: 'VOLANTEXRC' },
        { q: 'RC plane' },
      ],
      [{ q: 'servo' }],
      [{ q: 'HobbyZone HBZ', sku: 'HBZ444000', model: 'Sport Cub', brand: 'HobbyZone' }],
    );
    assert.equal(ordered[0].q, 'RC plane');
    assert.equal(ordered[1].q, 'servo');
    assert.ok(ordered[2].sku === '761-14' || ordered[2].sku === 'HBZ444000');
  });

  it('guidReviewPrompt asks for generic category/part terms first (FR #5290)', () => {
    const prompt = guidReviewPrompt({
      host: 'www.mymodelflyingclub.co.uk',
      hostkey: 'www.mymodelflyingclub.co.uk',
      guid: '8504174c-f21f-4fe0-b8eb-98e7d7ceaed0',
      pageText: 'Sport Cub',
      pageHead: {},
      hostAnnotations: {},
    });
    assert.match(prompt, /FR #5290/);
    assert.match(prompt, /generic/i);
    assert.match(prompt, /product type|category|part term/i);
    assert.match(prompt, /no location|no.*currency|keyword-only/i);
  });

  it('PAGE_SKELETON search_queries show a generic example row', () => {
    const qs = PAGE_SKELETON.search_queries || [];
    assert.ok(qs.some(isGenericSearchQuery));
  });

  it('docs pin FR #5290 generic queries', () => {
    const annot = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'a-annotator-a-sqlsearch.md'),
      'utf8',
    );
    const rq = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'redqueen-annotations.md'),
      'utf8',
    );
    assert.match(annot + '\n' + rq, /FR #5290/);
    assert.match(annot + '\n' + rq, /generic/i);
  });
});