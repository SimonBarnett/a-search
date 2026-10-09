'use strict';

/**
 * docs/mrb-1100: hostile pins for harvest-lesson PR #1100
 * (FR-N+1 IAM-on-bucket stacking / CONFLICTING tip playbook).
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

describe('MRB #1100 hostile harvest FR-N+1 IAM stacking lesson', () => {
  it('skill carries contiguous FR-N+1 IAM / CONFLICTING / absence-pins lesson', () => {
    assert.ok(fs.existsSync(skillPath));
    assertNoBom(skillPath);
    assertNoBom(
      path.join(root, 'tests', 'mrb1100-hostile-harvest-fr-n1-iam.test.js'),
    );
    const text = fs.readFileSync(skillPath, 'utf8');
    assert.match(text, /FR-N\+1 wires IAM onto a bucket FR-N created/);
    assert.match(text, /merge main into the CONFLICTING tip/);
    assert.match(text, /early construct placement for wiring/);
    assert.match(text, /relax prior hostile absence-pins/);
    assert.match(text, /mrb1087 no-grant/);
    assert.match(text, /presence pins on docs\/mrb-N after merge/);
    // Relocated + intake sections may both exist (FR-139 CI / harvest fold).
    const headings = text.match(/^## Harvested lessons/gm) || [];
    assert.ok(headings.length >= 1 && headings.length <= 2, String(headings.length));
  });
});
