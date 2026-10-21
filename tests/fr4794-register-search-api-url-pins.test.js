'use strict';

/**
 * FR #4794: fr4231/fr4240 Register-AClubsQueueService spawnSync arg lists must
 * pass -SearchApiUrl so Windows npm test clears FR #4311 search_api_url_required.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('FR #4794 Register spawn SearchApiUrl pins', () => {
  it('fr4231 has -SearchApiUrl on each Register -File spawn (2)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, 'fr4231-reviewer-service-logon.test.js'),
      'utf8',
    );
    const n = (src.match(/'-SearchApiUrl'/g) || []).length;
    assert.ok(n >= 2, `expected >=2 -SearchApiUrl args, got ${n}`);
  });

  it('fr4240 has -SearchApiUrl on each Register -File spawn (2)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, 'fr4240-grok-home-localsystem.test.js'),
      'utf8',
    );
    const n = (src.match(/'-SearchApiUrl'/g) || []).length;
    assert.ok(n >= 2, `expected >=2 -SearchApiUrl args, got ${n}`);
  });
});
