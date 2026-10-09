'use strict';

/**
 * docs/mrb-1106: hostile pins for harvest-lesson PR #1106
 * (staging FR CONFLICT keep-both require/gitignore + wireResultsBucketAccess).
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

function assertNoBom(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.ok(
    !(buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf),
    `${path.relative(root, filePath)} must be UTF-8 without BOM`,
  );
}

describe('MRB #1106 hostile harvest staging CONFLICT keep-both lesson', () => {
  it('skill carries contiguous staging keep-both / wireResultsBucketAccess lesson', () => {
    assert.ok(fs.existsSync(skillPath));
    assertNoBom(skillPath);
    assertNoBom(
      path.join(root, 'tests', 'mrb1106-hostile-harvest-staging-keep-both.test.js'),
    );
    const text = fs.readFileSync(skillPath, 'utf8');
    assert.match(text, /When staging FR tips CONFLICT after sibling stage\/IAM merges/);
    assert.match(text, /keep-both require\(\) imports and gitignore asset dirs/);
    assert.match(
      text,
      /wireResultsBucketAccess still wraps the staged onboarding Lambdas before merge/,
    );
    assert.match(text, /MRB a-search#1096 FR-132 PASS/);
    assert.match(text, /docs\/mrb #1104/);
    // Folded under relocated section — no second intake heading.
    assert.equal(
      (text.match(/^## Harvested lessons/gm) || []).length,
      1,
      'exactly one ## Harvested lessons heading',
    );
    assert.doesNotMatch(text, /^## Harvested lessons \(intake\)/m);
  });
});
