'use strict';

/** FR-049a: docs/onboarding-agents.md contract */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('FR-049a docs/onboarding-agents.md', () => {
  it('doc has remaining=0 exit and signup fields', () => {
    const doc = path.join(root, 'docs', 'onboarding-agents.md');
    assert.ok(fs.existsSync(doc));
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(text, /remaining\s*===\s*0|remaining=0/);
    assert.match(text, /exit 0|exit\s+0/i);
    assert.match(text, /signups/i);
    assert.match(text, /merchantId/);
    assert.match(text, /merchantName/);
    assert.match(text, /signedUpAt/);
    assert.match(text, /madeira-awin-clubscan|clubscan/i);
  });

  it('root README links to docs/onboarding-agents.md', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/onboarding-agents\.md/);
  });
});
