'use strict';

/**
 * FR-2315 / FR-2314: tip-loop close must not treat product ExistingPrUrl as harvest twin;
 * never bare pull/N body substring match.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillPath = path.join(
  root,
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);
const {
  isHarvestLessonPr,
  bodyHasExactExistingPr,
  isTipLoopTwin,
} = require('../shared/harvest/tipLoopTwinFilter');

const PRODUCT_URL = 'https://github.com/SimonBarnett/a-search/pull/2195';
const HARVEST_URL = 'https://github.com/SimonBarnett/a-search/pull/2249';
const LESSON_PREFIX =
  'lesson(harvest-agent-skills): a-search MRB CONFLICTING tip with comment-only overlap';

describe('FR-2315 tip-loop ExistingPrUrl harvest-only filter', () => {
  it('isHarvestLessonPr: lesson( title or harvest-lesson label', () => {
    assert.equal(
      isHarvestLessonPr({
        title:
          'lesson(harvest-agent-skills): a-search MRB CONFLICTING tip with comment-only overlap',
      }),
      true,
    );
    assert.equal(
      isHarvestLessonPr({
        title: 'FR-248: outbound network params + merchant unstamp (Closes #1362)',
      }),
      false,
    );
    assert.equal(
      isHarvestLessonPr({
        title: 'docs/mrb-2249: hostile pin',
        labels: ['harvest-lesson'],
      }),
      true,
    );
  });

  it('bodyHasExactExistingPr: exact Existing PR line only; bare pull/N is false', () => {
    assert.equal(
      bodyHasExactExistingPr(
        `Existing PR: ${PRODUCT_URL}\n`,
        PRODUCT_URL,
      ),
      true,
    );
    assert.equal(
      bodyHasExactExistingPr(
        'Pattern: a-search#2250 (pin for #2238) see pull/2250 as example',
        'https://github.com/SimonBarnett/a-search/pull/2250',
      ),
      false,
    );
    assert.equal(
      bodyHasExactExistingPr(
        `Refs https://github.com/SimonBarnett/a-search/pull/2195`,
        PRODUCT_URL,
      ),
      false,
    );
  });

  it('product ExistingPrUrl must not close substance harvest tip (class of #2311/#2195)', () => {
    const productMeta = {
      number: 2195,
      title: 'FR-248: outbound network params + merchant unstamp (Closes #1362)',
      labels: [],
    };
    const substanceTip = {
      number: 2311,
      title: `${LESSON_PREFIX} (FR-179 wix enable vs FR-248)`,
      body: `Existing PR: ${PRODUCT_URL}\n`,
      labels: ['harvest-lesson', 'via-intake'],
    };
    assert.equal(
      isTipLoopTwin({
        candidate: substanceTip,
        existingPrUrl: PRODUCT_URL,
        thisLessonTitlePrefix: LESSON_PREFIX,
        existingPrMeta: productMeta,
      }),
      true,
      'title StartsWith of THIS lesson still matches (same lesson re-harvest)',
    );
    // Different lesson title that only cites product ExistingPrUrl must NOT match
    const otherLesson = {
      number: 2311,
      title:
        'lesson(harvest-agent-skills): a-search MRB CONFLICTING tip with comment-only overlap (FR-179 wix enabl...',
      body: `Existing PR: ${PRODUCT_URL}\n`,
      labels: ['harvest-lesson'],
    };
    assert.equal(
      isTipLoopTwin({
        candidate: otherLesson,
        existingPrUrl: PRODUCT_URL,
        thisLessonTitlePrefix:
          'lesson(harvest-agent-skills): unrelated other lesson about widgets',
        existingPrMeta: productMeta,
      }),
      false,
      'product ExistingPrUrl must not twin-close a harvest tip',
    );
  });

  it('harvest ExistingPrUrl + exact Existing PR line may twin-close', () => {
    const harvestMeta = {
      number: 2249,
      title:
        'lesson(harvest-agent-skills): MRB shop-sync Lambda consumer: handler(event, context, deps)',
      labels: ['harvest-lesson'],
    };
    const twin = {
      number: 2309,
      title: 'lesson(harvest-agent-skills): MRB shop-sync Lambda consumer: handler(event, context, deps) like schedu...',
      body: `Existing PR: ${HARVEST_URL}\n`,
      labels: ['via-intake'],
    };
    assert.equal(
      isTipLoopTwin({
        candidate: twin,
        existingPrUrl: HARVEST_URL,
        thisLessonTitlePrefix:
          'lesson(harvest-agent-skills): MRB shop-sync Lambda consumer: handler(event, context, deps)',
        existingPrMeta: harvestMeta,
      }),
      true,
    );
  });

  it('bare pull/N example in body (#2254 class) is not a twin', () => {
    const pinMeta = {
      number: 2250,
      title: 'docs/mrb-2238: hostile pin redirect_uri allowlist harvest lesson',
      labels: [],
    };
    const unrelated = {
      number: 2254,
      title:
        'lesson(harvest-agent-skills): MRB docs/mrb after harvest tip: if the tip is still open and this seat a...',
      body:
        'Pattern: a-search#2250 (pin for #2238 redirect_uri allowlist lesson) - tip MERGEABLE...',
      labels: ['harvest-lesson'],
    };
    assert.equal(
      isTipLoopTwin({
        candidate: unrelated,
        existingPrUrl: 'https://github.com/SimonBarnett/a-search/pull/2250',
        thisLessonTitlePrefix:
          'lesson(harvest-agent-skills): docs/mrb pin that Refs a still-open harvest tip',
        existingPrMeta: pinMeta,
      }),
      false,
    );
  });

  it('SKILL.md pins FR-2315 product ExistingPrUrl + FR-2314 exact Existing PR line', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'UTF-8 no BOM');
    const text = buf.toString('utf8');
    assert.match(text, /FR-2315|product ExistingPrUrl/);
    assert.match(
      text,
      /harvest-lesson tip|title starts with `?lesson\(/,
    );
    assert.match(text, /never a bare pull\/N|never bare pull\/N/);
    assert.match(text, /Existing PR: /);
    assert.match(text, /FR-2314|#2314/);
  });
});