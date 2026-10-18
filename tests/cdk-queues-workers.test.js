'use strict';

/**
 * FR-036: CDK queues + worker Lambdas for enabled marketplace shortlist.
 * FR-3949: kind:local / DB-backed sources skip per-source queues; shared
 * a-search-db-backed (+ SQS_DB_BACKED_URL on entry) instead.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');
const { loadRegistry } = require('../providers/loadRegistry');
const { queueName } = require('../providers/queueName');

const root = path.join(__dirname, '..');

/** Marketplace (kind:live) ids that still get per-source AWS workers. */
const LIVE_ENABLED_IDS = ['amazon', 'ebay', 'rakuten', 'cj'];
/** Local/DB-backed ids: worker modules remain, but CDK no longer wires queues. */
const LOCAL_ENABLED_IDS = ['awin', 'impact'];

describe('FR-036 CDK queues + workers for enabled shortlist', () => {
  it('stack source loops registry and wires SQS event source', () => {
    const text = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(text, /loadRegistry|enabledSources/);
    assert.match(text, /SqsEventSource/);
    assert.match(text, /workerHandlerPath\(src\)|worker\.handler/);
    // functionName template: a-search-${src.id}-worker-${env}
    assert.match(text, /a-search-\$\{src\.id\}-worker-\$\{env\}/);
    // FR-3949: local providers skipped in the worker loop
    assert.match(text, /isLocalProviderFolder/);
  });

  it('enabled providers export worker.handler', () => {
    const { sources } = loadRegistry();
    for (const id of [...LIVE_ENABLED_IDS, ...LOCAL_ENABLED_IDS]) {
      const src = sources.find((s) => s.id === id);
      assert.ok(src, id);
      const workerPath = path.join(root, src.folder, 'src', 'worker.js');
      const text = fs.readFileSync(workerPath, 'utf8');
      assert.match(text, /async function handler\b/);
      assert.match(text, /\bhandler\b/);
      const mod = require(workerPath);
      assert.equal(typeof mod.handler, 'function');
      assert.equal(typeof mod.run, 'function');
    }
  });

  it('npm run synth emits queues for each enabled id x env and event source', () => {
    const r = runCdkSynth(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);

    const templatePath = path.join(r.outDir, 'ASearchStack.template.json');
    assert.ok(
      fs.existsSync(templatePath),
      'synth must emit ASearchStack.template.json',
    );
    const tpl = fs.readFileSync(templatePath, 'utf8');

    for (const id of LIVE_ENABLED_IDS) {
      assert.match(tpl, new RegExp(queueName(id, 'live')));
      assert.match(tpl, new RegExp(queueName(id, 'sandbox')));
      assert.match(tpl, new RegExp(`a-search-${id}-worker-live`));
      assert.match(tpl, new RegExp(`a-search-${id}-worker-sandbox`));
    }

    // FR-3949: no per-source local queues/workers; shared db-backed instead
    assert.doesNotMatch(tpl, /a-search-provider-awin-live\.fifo/);
    assert.doesNotMatch(tpl, /a-search-awin-sandbox/);
    assert.doesNotMatch(tpl, /a-search-awin-worker-/);
    assert.doesNotMatch(tpl, /a-search-impact-worker-/);
    assert.match(tpl, /a-search-db-backed/);
    assert.match(tpl, /SQS_DB_BACKED_URL/);

    // Fail-when: only amazon queues exist
    assert.match(tpl, /a-search-provider-ebay-live\.fifo/);

    assert.match(tpl, /AWS::Lambda::EventSourceMapping/);
    assert.match(tpl, /SQS_EBAY_LIVE_URL|SQS_EBAY_SANDBOX_URL/);
  });
});
