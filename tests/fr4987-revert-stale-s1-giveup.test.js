'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('FR #4987 revert stale #4975 S1 GIVEUP lesson', () => {
  it('harvest-agent-skills has CDK+IAM smoke lesson and no JWT GIVEUP for S1', () => {
    const text = fs.readFileSync(SKILL, 'utf8');
    assert.match(
      text,
      /a-search #4881 smoke: runs inside the CDK deploy, reads SearchApiUrl from stack outputs, signs POST \/search with IAM \(SigV4, #4888\); no JWT or hand-set URL\. Missing A_SEARCH_\* env on a seat is never a GIVEUP reason\. Never invent a 200\./,
    );
    assert.doesNotMatch(text, /deploy-host checklist/);
    assert.doesNotMatch(
      text,
      /UAT S1 live smoke-deploy FR on a shop without A_SEARCH_API_URL/,
    );
    assert.doesNotMatch(text, /if SearchApiUrl and smoke JWT are unset/);
  });
});
