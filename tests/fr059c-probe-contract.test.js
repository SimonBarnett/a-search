'use strict';

/**
 * FR-059c: shared selftest probe contract — probe(source) -> { ok, source, latencyMs, error? }
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  isProbeResult,
  assertProbeResult,
  assertProbeFn,
  runProbe,
} = require('../shared/selftest/probeContract');

const root = path.join(__dirname, '..');

describe('FR-059c shared provider selftest probe contract', () => {
  it('isProbeResult accepts ok success and fail with error', () => {
    assert.equal(
      isProbeResult({ ok: true, source: 'amazon', latencyMs: 12 }),
      true,
    );
    assert.equal(
      isProbeResult({
        ok: false,
        source: 'ebay',
        latencyMs: 3,
        error: 'browse_api_unreachable',
      }),
      true,
    );
  });

  it('isProbeResult rejects missing fields / fail without error', () => {
    assert.equal(isProbeResult(null), false);
    assert.equal(isProbeResult({ ok: true, source: 'amazon' }), false);
    assert.equal(
      isProbeResult({ ok: false, source: 'cj', latencyMs: 1 }),
      false,
    );
    assert.equal(
      isProbeResult({ ok: true, source: '', latencyMs: 1 }),
      false,
    );
    assert.equal(
      isProbeResult({ ok: true, source: 'awin', latencyMs: -1 }),
      false,
    );
  });

  it('assertProbeFn requires a function', () => {
    assert.throws(() => assertProbeFn(null), /probe must be a function/);
    assert.doesNotThrow(() => assertProbeFn(async () => ({})));
  });

  it('runProbe validates injectable probe and fills latencyMs', async () => {
    let t = 100;
    const result = await runProbe(
      async (source) => ({
        ok: true,
        source,
      }),
      'amazon',
      {
        now: () => {
          const cur = t;
          t += 25;
          return cur;
        },
      },
    );
    assert.equal(result.ok, true);
    assert.equal(result.source, 'amazon');
    assert.equal(result.latencyMs, 25);
  });

  it('runProbe preserves probe-supplied latencyMs and error', async () => {
    const result = await runProbe(
      async (source) => ({
        ok: false,
        source,
        latencyMs: 7,
        error: 'timeout',
      }),
      'impact',
    );
    assert.deepEqual(result, {
      ok: false,
      source: 'impact',
      latencyMs: 7,
      error: 'timeout',
    });
  });

  it('runProbe rejects invalid probe results', async () => {
    // ok:false without error stays invalid even after source/latency fill
    await assert.rejects(
      () =>
        runProbe(
          async () => ({ ok: false, source: 'amazon', latencyMs: 1 }),
          'amazon',
        ),
      /assertProbeResult/,
    );
  });

  it('shared package lists selftest/ and docs mention probeContract', () => {
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
    assert.match(docs, /probeContract|selftest\/probeContract/);
  });
});
