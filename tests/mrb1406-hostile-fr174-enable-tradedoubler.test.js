'use strict';

/**
 * Hostile pins for MRB #1406 / FR-174 (enable tradedoubler both envs).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const registryPath = path.join(root, 'providers', 'registry.json');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const frPath = path.join(root, 'docs', 'fr', 'FR-174.md');
const matrixPath = path.join(root, 'docs', 'secrets-matrix.md');

describe('MRB-1406 hostile FR-174 enable tradedoubler', () => {
  it('registry enables tradedoubler both envs; floors 12x2 keep-both shopify', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    const td = byId.get('tradedoubler');
    assert.ok(td);
    assert.equal(td.enabled.live, true);
    assert.equal(td.enabled.sandbox, true);
    const enabled = registry.sources
      .filter((s) => s.enabled && s.enabled.live && s.enabled.sandbox)
      .map((s) => s.id)
      .sort();
    // GBP/UK hold: bol/aliexpress/avantlink dark → 13 enabled (floors 26).
    assert.equal(enabled.length, 12, `enabled count ${enabled.length}`);
    assert.ok(enabled.includes('tradedoubler'));
    assert.ok(enabled.includes('partnerize'));
    assert.ok(enabled.includes('shopify'));
    assert.equal(enabled.includes('bol'), false, 'GBP hold bol');
    assert.equal(enabled.includes('avantlink'), false, 'GBP hold avantlink');
    assert.equal(enabled.includes('aliexpress'), false, 'GBP hold aliexpress');
  });

  it('CDK PROVIDER_CREDENTIAL_KEYS.tradedoubler + Decision LOCKED + matrix grant', () => {
    const stack = fs.readFileSync(stackPath, 'utf8');
    const keysBlock = stack.match(/PROVIDER_CREDENTIAL_KEYS\s*=\s*\{[\s\S]*?\n\};/);
    assert.ok(keysBlock);
    assert.match(keysBlock[0], /\btradedoubler\s*:/);
    assert.match(keysBlock[0], /TRADEDOUBLER_API_KEY/);

    const frBuf = fs.readFileSync(frPath);
    assert.notEqual(frBuf[0], 0xef, 'FR-174.md BOM');
    const fr = frBuf.toString('utf8');
    assert.match(fr, /Decision\s*\(?\s*LOCKED\)?/i);
    assert.match(fr, /tradedoubler/);

    const matrixBuf = fs.readFileSync(matrixPath);
    assert.notEqual(matrixBuf[0], 0xef, 'secrets-matrix BOM');
    const matrix = matrixBuf.toString('utf8');
    assert.match(
      matrix,
      /a-search-\{amazon,ebay,rakuten,cj\}-worker-\{live,sandbox\}/,
    );
    assert.match(
      matrix,
      /a-search-\{awin,impact\}-worker-\{live,sandbox\}/,
    );
    assert.match(matrix, /tradedoubler/);
    assert.match(matrix, /a-search-tradedoubler-worker-\{live,sandbox\}/);
    assert.doesNotMatch(matrix, /Stay-dark omitted[\s\S]*\btradedoubler\b/i);
  });

  it('product pin fr174-enable-tradedoubler.test.js present', () => {
    assert.ok(
      fs.existsSync(path.join(root, 'tests', 'fr174-enable-tradedoubler.test.js')),
    );
  });
});
