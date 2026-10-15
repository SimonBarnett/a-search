'use strict';

/**
 * docs/mrb-2317 hostile pin for FR-2315/FR-2314 tip-loop ExistingPrUrl filter.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB-2317 FR-2315 tip-loop ExistingPrUrl hostile', () => {
  it('helper exports isHarvestLessonPr / bodyHasExactExistingPr / isTipLoopTwin', () => {
    const mod = require(path.join(root, 'shared', 'harvest', 'tipLoopTwinFilter.js'));
    assert.equal(typeof mod.isHarvestLessonPr, 'function');
    assert.equal(typeof mod.bodyHasExactExistingPr, 'function');
    assert.equal(typeof mod.isTipLoopTwin, 'function');
    assert.equal(
      mod.bodyHasExactExistingPr('see pull/2195 in prose', 'https://github.com/SimonBarnett/a-search/pull/2195'),
      false,
    );
    assert.equal(
      mod.bodyHasExactExistingPr(
        'Existing PR: https://github.com/SimonBarnett/a-search/pull/2195',
        'https://github.com/SimonBarnett/a-search/pull/2195',
      ),
      true,
    );
    assert.equal(
      mod.isTipLoopTwin({
        candidate: {
          number: 2311,
          title: 'lesson(harvest-agent-skills): comment-only',
          body: 'Existing PR: https://github.com/SimonBarnett/a-search/pull/2195',
          labels: ['harvest-lesson'],
        },
        existingPrUrl: 'https://github.com/SimonBarnett/a-search/pull/2195',
        thisLessonTitlePrefix: 'lesson(harvest-agent-skills): tip-loop',
        existingPrMeta: { number: 2195, title: 'FR-248: outbound', labels: [] },
      }),
      false,
      'product ExistingPrUrl must not twin-close harvest tip',
    );
  });

  it('SKILL.md FR-2315 + FR-2314 contiguous; UTF-8 no BOM', () => {
    const buf = fs.readFileSync(
      path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'),
    );
    assert.notEqual(buf[0], 0xef);
    const text = buf.toString('utf8');
    assert.match(text, /FR-2315/);
    assert.match(text, /FR-2314/);
    assert.match(text, /tipLoopTwinFilter\.js/);
    assert.match(text, /Existing PR: <url>|Existing PR: \$\{|exact line `Existing PR:/);
    assert.doesNotMatch(text, /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
