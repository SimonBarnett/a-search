'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const doc = path.join(root, 'docs', 'rclone-results.md');
const envDoc = path.join(root, 'docs', 'environments.md');
const skill = path.join(
  root,
  '.grok',
  'skills',
  'a-search-endpoint',
  'SKILL.md',
);

describe('FR-029 docs/rclone-results.md', () => {
  it('doc uses canonical {env}/{source}/{userId}/{catalogId}/{searchId}.json', () => {
    assert.ok(fs.existsSync(doc), 'docs/rclone-results.md');
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(
      text,
      /\{env\}\/\{source\}\/\{userId\}\/\{catalogId\}\/\{searchId\}\.json/,
    );
    assert.match(text, /A_SEARCH_RCLONE_ROOT/);
    assert.match(text, /S3_RESULTS_BUCKET/);
  });

  it('environments.md and a-search-endpoint skill link the doc', () => {
    const envText = fs.readFileSync(envDoc, 'utf8');
    assert.match(envText, /rclone-results\.md/);
    assert.match(
      envText,
      /\{env\}\/\{source\}\/\{userId\}\/\{catalogId\}\/\{searchId\}\.json/,
    );
    const skillText = fs.readFileSync(skill, 'utf8');
    assert.match(skillText, /rclone-results\.md/);
    assert.match(
      skillText,
      /\{env\}\/\{source\}\/\{userId\}\/\{catalogId\}\/\{searchId\}\.json/,
    );
  });
});
