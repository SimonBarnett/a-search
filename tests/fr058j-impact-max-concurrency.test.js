'use strict';

/**
 * FR-058j: CDK SQS maxConcurrency for impact workers.
 * FR-3949: local/DB-backed impact workers are not deployed; shared a-search-db-backed
 * queue has no Lambda ESM. Registry rateLimit may remain for documentation.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ensureDefaultStackSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const registryPath = path.join(root, 'providers', 'registry.json');

describe('FR-058j impact SQS maxConcurrency', () => {
  it('registry impact still records rateLimit.maxConcurrency; stack skips local workers', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const impact = registry.sources.find((s) => s.id === 'impact');
    assert.ok(impact && impact.rateLimit, 'impact rateLimit required');
    // AWS SQS ESM MaximumConcurrency minimum is 2
    assert.equal(impact.rateLimit.maxConcurrency, 2);

    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /isLocalProviderFolder|FR-3949/);
    assert.match(text, /maxConcurrency/);
  });

  it('synth: no impact worker event source mappings (FR-3949)', () => {
    let cdk;
    try {
      cdk = require('aws-cdk-lib');
    } catch (err) {
      assert.match(String(err && err.message), /Cannot find module|aws-cdk-lib/);
      return;
    }
    void cdk;
    const { outDir } = ensureDefaultStackSynth(root);
    const parsed = JSON.parse(
      fs.readFileSync(path.join(outDir, 'ASearchStack.template.json'), 'utf8'),
    );
    const mappings = Object.entries(parsed.Resources || {}).filter(
      ([, res]) => res.Type === 'AWS::Lambda::EventSourceMapping',
    );
    const impactWorkerMappings = mappings.filter(([logicalId, res]) => {
      const id = String(logicalId);
      const fn = JSON.stringify(res.Properties || {});
      return (
        (/ImpactLive|ImpactSandbox|impact-worker|ImpactWorker/i.test(id) ||
          /a-search-impact-(live|sandbox)/i.test(fn)) &&
        !/Onboarding/i.test(id) &&
        !/Onboarding/i.test(fn)
      );
    });
    assert.equal(
      impactWorkerMappings.length,
      0,
      `FR-3949: no impact worker ESM expected, got ${impactWorkerMappings.map(([id]) => id).join(',')}`,
    );
  });
});
