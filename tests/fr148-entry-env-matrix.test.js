'use strict';

/**
 * FR-148: entry Lambda is env-agnostic for accept (no CDK A_SEARCH_ENV=sandbox).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-148 entry env matrix (multi-env accept)', () => {
  it('stack entryEnv omits A_SEARCH_ENV; workers still pin live/sandbox', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /FR-148/);
    // entryEnv block must not assign A_SEARCH_ENV
    const entryEnvMatch = text.match(
      /const entryEnv\s*=\s*\{([\s\S]*?)\n\s*\};/,
    );
    assert.ok(entryEnvMatch, 'entryEnv object missing');
    assert.doesNotMatch(entryEnvMatch[1], /A_SEARCH_ENV/);
    // Workers / maintainer remain pinned
    assert.match(text, /A_SEARCH_ENV:\s*env/);
    assert.match(text, /A_SEARCH_ENV:\s*'live'/);
    assert.match(text, /A_SEARCH_ENV:\s*'sandbox'/);
  });

  it('entry accept stamps jobEnv from body.sandbox (default live)', () => {
    const index = fs.readFileSync(
      path.join(root, 'entry', 'src', 'index.js'),
      'utf8',
    );
    assert.match(
      index,
      /jobEnv\s*=\s*validated\.value\.sandbox\s*\?\s*'sandbox'\s*:\s*'live'/,
    );
  });

  it('synth: EntryFunction has no A_SEARCH_ENV; a worker still has it', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr148');
    fs.rmSync(outdir, { recursive: true, force: true });
    const app = new cdk.App({ outdir });
    new ASearchStack(app, 'ASearchStack');
    app.synth();

    const tpl = JSON.parse(
      fs.readFileSync(path.join(outdir, 'ASearchStack.template.json'), 'utf8'),
    );
    const resources = tpl.Resources || {};
    const entry = Object.values(resources).find(
      (res) =>
        res &&
        res.Type === 'AWS::Lambda::Function' &&
        res.Properties &&
        res.Properties.FunctionName === 'a-search-entry',
    );
    assert.ok(entry, 'missing a-search-entry');
    const entryVars = (entry.Properties.Environment &&
      entry.Properties.Environment.Variables) ||
      {};
    assert.equal(
      Object.prototype.hasOwnProperty.call(entryVars, 'A_SEARCH_ENV'),
      false,
      'entry must not set A_SEARCH_ENV',
    );

    const worker = Object.values(resources).find(
      (res) =>
        res &&
        res.Type === 'AWS::Lambda::Function' &&
        res.Properties &&
        res.Properties.FunctionName === 'a-search-amazon-worker-live',
    );
    assert.ok(worker, 'missing amazon live worker');
    const workerVars = (worker.Properties.Environment &&
      worker.Properties.Environment.Variables) ||
      {};
    assert.equal(workerVars.A_SEARCH_ENV, 'live');
  });

  it('docs: environments Entry behaviour FR-148 + Decision LOCKED', () => {
    const env = fs.readFileSync(path.join(root, 'docs', 'environments.md'), 'utf8');
    assert.match(env, /FR-148/);
    assert.match(env, /omits.*A_SEARCH_ENV|env-agnostic/i);

    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-148.md'), 'utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /fr148-entry-env-matrix\.test\.js/);

    const example = fs.readFileSync(
      path.join(root, 'entry', '.env.example'),
      'utf8',
    );
    assert.match(example, /FR-148/);
    assert.doesNotMatch(example, /^A_SEARCH_ENV=sandbox\s*$/m);
  });
});
