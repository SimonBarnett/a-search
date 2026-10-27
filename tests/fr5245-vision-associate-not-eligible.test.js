'use strict';

/**
 * FR #5245: root VISION.md must not list creators_not_eligible as immediate DLQ
 * after FR #5220 (provider_unavailable + _search-done serviced 0).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('FR #5245 vision AssociateNotEligible is unavailable', () => {
  it('root VISION.md DLQ list excludes creators_not_eligible; cites 5220', () => {
    const t = fs.readFileSync(path.join(root, 'VISION.md'), 'utf8');
    assert.match(t, /FR #5220/);
    assert.match(t, /provider_unavailable/);
    assert.match(t, /AssociateNotEligible/);
    // Old list put the eligibility code in the immediate-DLQ parenthetical.
    assert.doesNotMatch(
      t,
      /\(`creators_not_eligible`, `rakuten_invalid_context`, `cj_not_authorised`/,
    );
  });

  it('amazon skill does not send AssociateNotEligible to the DLQ', () => {
    const t = fs.readFileSync(
      path.join(
        root,
        'providers',
        'live',
        'amazon',
        '.grok',
        'skills',
        'a-search-amazon',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(t, /FR #5220/);
    assert.doesNotMatch(
      t,
      /creators_not_eligible` AssociateNotEligible\): fail into DLQ/,
    );
  });
});
