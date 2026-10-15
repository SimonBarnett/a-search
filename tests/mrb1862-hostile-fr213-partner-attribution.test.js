'use strict';

/**
 * MRB #1862 docs/hostile: FR-213 partnerId attribution + tenantId on recordClick.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('MRB #1862 hostile FR-213 partner attribution', () => {
  it('FR-213 Decision LOCKED ASCII; go.js recordClick has partnerId + tenantId', () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-213.md'));
    assert.notEqual(fr[0], 0xef, 'no BOM');
    const text = fr.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /partnerId/);
    assert.match(text, /tenantId/);
    assert.match(text, /recordClick/);
    assert.ok(fs.existsSync(path.join(ROOT, 'tests', 'fr213-partner-attribution.test.js')));

    const go = fs.readFileSync(path.join(ROOT, 'shared', 'widgets', 'go.js'), 'utf8');
    assert.match(go, /partnerId:\s*customer\.partnerId\s*\|\|\s*null/);
    assert.match(go, /tenantId:\s*customer\.clubId\s*\|\|\s*null/);
  });
});
