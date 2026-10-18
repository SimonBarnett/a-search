'use strict';
/**
 * MRB #4343: custom cdk.App context must merge the provider-env fixture.
 * The CI synth bullet stays the previous line.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const book = fs.readFileSync(
  path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'),
  'utf8',
);

const prior = 'When a stack reads gitignored provider env files at synth, npm run synth must pass the fixture root. The in-process test helper context does not cover the CI synth script. Do not auto-merge the head whose synth script still fails on a clean checkout.';
const lesson = 'When CDK tests build cdk.App with custom -c context, always merge providerEnvRoot=tests/fixtures/provider-env (or ensureDefaultStackSynth); package.json synth -c alone does not cover in-process App constructors.';

describe('MRB #4343 provider env context lesson', () => {
  it('keeps the CI synth bullet and appends the in-process App bullet', () => {
    const norm = book.replace(/\r\n/g, '\n');
    const window = prior + '\n- ' + lesson;
    assert.ok(norm.includes(window), 'contiguous prior bullet then new lesson');
    assert.equal(book.includes('\uFEFF'), false);
  });
});
