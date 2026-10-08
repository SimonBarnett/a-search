'use strict';

/**
 * FR-059d: selftest orchestrator probes enabled registry sources; disabled skipped.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  runSelftestOrchestrator,
} = require('../shared/selftest/orchestrator');

const root = path.join(__dirname, '..');

describe('FR-059d selftest orchestrator', () => {
  it('probes each enabled source for env; skips disabled', async () => {
    const probed = [];
    const listEnabled = (env) => {
      assert.equal(env, 'live');
      return ['amazon', 'ebay']; // awin disabled for this fixture
    };
    const probe = async (source) => {
      probed.push(source);
      return { ok: true, source, latencyMs: 1 };
    };

    const out = await runSelftestOrchestrator({
      env: 'live',
      probe,
      listEnabled,
    });

    assert.deepEqual(probed, ['amazon', 'ebay']);
    assert.equal(out.env, 'live');
    assert.equal(out.providers.length, 2);
    assert.deepEqual(
      out.providers.map((p) => p.source),
      ['amazon', 'ebay'],
    );
    assert.deepEqual(out.failed, []);
    assert.ok(!probed.includes('awin'));
  });

  it('optional sources filter only intersects enabled', async () => {
    const probed = [];
    const out = await runSelftestOrchestrator({
      env: 'sandbox',
      sources: ['ebay', 'kelkoo'], // kelkoo not enabled
      listEnabled: () => ['amazon', 'ebay', 'awin'],
      probe: async (source) => {
        probed.push(source);
        return { ok: true, source, latencyMs: 2 };
      },
    });
    assert.deepEqual(probed, ['ebay']);
    assert.equal(out.providers.length, 1);
    assert.equal(out.providers[0].source, 'ebay');
  });

  it('aggregates failed ids when probe returns ok:false', async () => {
    const out = await runSelftestOrchestrator({
      env: 'live',
      listEnabled: () => ['amazon', 'ebay'],
      probe: async (source) =>
        source === 'ebay'
          ? {
              ok: false,
              source,
              latencyMs: 5,
              error: 'browse_api_unreachable',
            }
          : { ok: true, source, latencyMs: 1 },
    });
    assert.deepEqual(out.failed, ['ebay']);
    assert.equal(out.providers[1].error, 'browse_api_unreachable');
  });

  it('probe throw becomes failed row (no intake here)', async () => {
    const out = await runSelftestOrchestrator({
      env: 'live',
      listEnabled: () => ['cj'],
      probe: async () => {
        throw new Error('boom');
      },
    });
    assert.equal(out.providers.length, 1);
    assert.equal(out.providers[0].ok, false);
    assert.equal(out.providers[0].source, 'cj');
    assert.match(out.providers[0].error, /boom/);
    assert.deepEqual(out.failed, ['cj']);
  });

  it('works with providers/loadRegistry.enabled against real registry', async () => {
    const { enabled } = require('../providers/loadRegistry');
    const live = enabled('live');
    assert.ok(live.length >= 1, 'fixture registry should enable some live sources');
    assert.ok(!live.includes('kelkoo'), 'kelkoo disabled in registry');

    const probed = [];
    const out = await runSelftestOrchestrator({
      env: 'live',
      listEnabled: enabled,
      probe: async (source) => {
        probed.push(source);
        return { ok: true, source, latencyMs: 0 };
      },
    });
    assert.deepEqual(probed, live);
    assert.equal(out.providers.length, live.length);
    assert.ok(!probed.includes('kelkoo'));
  });

  it('shared package lists selftest/ and docs mention orchestrator', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(
      (pkg.files || []).includes('selftest/'),
      'shared/package.json files must list selftest/',
    );
    const docs = fs.readFileSync(
      path.join(root, 'docs', 'shared-layer.md'),
      'utf8',
    );
    assert.match(docs, /orchestrator|selftest\/orchestrator/);
  });
});
