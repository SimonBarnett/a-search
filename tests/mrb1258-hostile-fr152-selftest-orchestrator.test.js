'use strict';

/**
 * MRB #1258 hostile: FR-152 /selftest orchestrator + enabled probes; no mssql stage.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function assertUtf8NoBomAscii(filePath, label) {
  const buf = fs.readFileSync(filePath);
  assert.equal(
    buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
    false,
    `${label} must be UTF-8 without BOM`,
  );
  const text = buf.toString('utf8');
  assert.ok(
    !/[^\x09\x0A\x0D\x20-\x7E]/.test(text),
    `${label} must be ASCII (hostile b<128)`,
  );
  return text;
}

describe('MRB-1258 FR-152 selftest orchestrator hostile', () => {
  it('entry wires orchestrator + createRegistrySelftestProbe; stages probes not mssql', () => {
    const index = fs.readFileSync(path.join(root, 'entry', 'src', 'index.js'), 'utf8');
    assert.match(index, /shared\/selftest\/orchestrator|runSelftestOrchestrator/);
    assert.match(index, /createRegistrySelftestProbe|selftestProbes/);
    assert.match(index, /handleSelftest/);
    const probes = assertUtf8NoBomAscii(
      path.join(root, 'entry', 'src', 'selftestProbes.js'),
      'entry/src/selftestProbes.js',
    );
    assert.match(probes, /FR-152/);
    assert.match(probes, /SelftestProbe/);
    const stage = fs.readFileSync(
      path.join(root, 'scripts', 'stage-entry-lambda-asset.js'),
      'utf8',
    );
    assert.match(stage, /FR-152/);
    assert.match(stage, /enabledSelftestSources|selftestProbe\.js/);
    assert.match(stage, /NOT staged|mssql is missing|Local MSSQL driver is NOT staged/i);
    assert.doesNotMatch(stage, /fs\.cpSync\([^\n]*mssql|node_modules['"`\/\\]+mssql/);
    assert.match(stage, /fr151|node_modules\/jose/);
    assert.match(stage, /shared\/selftest\/orchestrator\.js/);
  });

  it('FR-152 LOCKED + gap pass2 Yes; docs/mrb cites product', () => {
    const fr = assertUtf8NoBomAscii(
      path.join(root, 'docs', 'fr', 'FR-152.md'),
      'docs/fr/FR-152.md',
    );
    assert.match(fr, /Decision:\s*LOCKED/i);
    assert.match(fr, /orchestrator|selftestProbe/i);
    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md'),
      'utf8',
    );
    assert.match(
      gap,
      /\/selftest still empty providers\[[^\n]*\*\*Yes\*\*[^\n]*FR-152/i,
    );
    const mrb = assertUtf8NoBomAscii(
      path.join(root, 'docs', 'mrb', 'mrb-1258.md'),
      'docs/mrb/mrb-1258.md',
    );
    assert.match(mrb, /#1258|#995|FR-152/);
  });
});
