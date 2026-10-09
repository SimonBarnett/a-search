'use strict';

/**
 * FR-130: S3_RESULTS_BUCKET env + PutObject/GetObject grants on Lambdas.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-130 S3_RESULTS_BUCKET env + IAM grants', () => {
  it('stack wires wireResultsBucketAccess for entry/workers/maintainer/onboarding', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /function wireResultsBucketAccess/);
    assert.match(text, /S3_RESULTS_BUCKET/);
    assert.match(text, /grantReadWrite/);
    assert.match(text, /wireResultsBucketAccess\(\s*entry/);
    assert.match(text, /wireResultsBucketAccess\(\s*worker/);
    assert.match(text, /wireResultsBucketAccess\(\s*maintainerLive/);
    assert.match(text, /wireResultsBucketAccess\(\s*maintainerSandbox/);
    assert.match(text, /wireResultsBucketAccess\(\s*awinOnboardingLive/);
    assert.match(text, /wireResultsBucketAccess\(\s*awinOnboardingSandbox/);
    assert.match(text, /wireResultsBucketAccess\(\s*impactOnboardingSandbox/);
    assert.match(text, /wireResultsBucketAccess\(\s*impactOnboardingLive/);
  });

  it('synth template has S3_RESULTS_BUCKET env and scoped S3 IAM (no Resource *)', () => {
    const r = runCdkSynth(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const templatePath = path.join(
      root,
      'cdk.out',
      'ASearchStack.template.json',
    );
    const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const resources = tpl.Resources || {};

    const entry = Object.values(resources).find(
      (res) =>
        res &&
        res.Type === 'AWS::Lambda::Function' &&
        res.Properties &&
        res.Properties.FunctionName === 'a-search-entry',
    );
    assert.ok(entry, 'missing a-search-entry');
    assert.equal(
      entry.Properties.Environment.Variables.S3_RESULTS_BUCKET !== undefined,
      true,
      'entry must have S3_RESULTS_BUCKET',
    );

    const workers = Object.values(resources).filter(
      (res) =>
        res &&
        res.Type === 'AWS::Lambda::Function' &&
        typeof res.Properties?.FunctionName === 'string' &&
        /a-search-.+-worker-(live|sandbox)/.test(res.Properties.FunctionName),
    );
    assert.ok(workers.length >= 1, 'expected enabled workers');
    for (const w of workers) {
      assert.ok(
        w.Properties.Environment.Variables.S3_RESULTS_BUCKET !== undefined,
        `${w.Properties.FunctionName} missing S3_RESULTS_BUCKET`,
      );
    }

    const policies = Object.values(resources).filter(
      (res) => res && res.Type === 'AWS::IAM::Policy',
    );
    const s3Actions = new Set();
    for (const pol of policies) {
      const docs = [].concat(
        pol.Properties?.PolicyDocument || [],
        pol.Properties?.PolicyDocument?.Statement ? [pol.Properties.PolicyDocument] : [],
      );
      const statements = [];
      for (const doc of docs) {
        if (doc && Array.isArray(doc.Statement)) statements.push(...doc.Statement);
      }
      // PolicyDocument is usually a single object
      const pd = pol.Properties && pol.Properties.PolicyDocument;
      if (pd && Array.isArray(pd.Statement)) {
        for (const st of pd.Statement) {
          const actions = [].concat(st.Action || []);
          const resourcesArr = [].concat(st.Resource || []);
          const isS3 = actions.some(
            (a) => typeof a === 'string' && a.startsWith('s3:'),
          );
          if (!isS3) continue;
          for (const a of actions) {
            if (typeof a === 'string' && a.startsWith('s3:')) s3Actions.add(a);
          }
          for (const res of resourcesArr) {
            if (res === '*') {
              assert.fail('S3 IAM must not use Resource * (FR-130 least-privilege)');
            }
          }
        }
      }
    }
    assert.ok(
      s3Actions.has('s3:PutObject') || [...s3Actions].some((a) => /PutObject/i.test(a)),
      `expected s3:PutObject in policies, got ${[...s3Actions].join(',')}`,
    );
    assert.ok(
      s3Actions.has('s3:GetObject') || [...s3Actions].some((a) => /GetObject/i.test(a)),
      `expected s3:GetObject in policies, got ${[...s3Actions].join(',')}`,
    );
  });
});
