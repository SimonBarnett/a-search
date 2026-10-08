'use strict';

/**
 * FR-057b: docs/tracked-links.md + amazon .env.example account keys (docs only).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('FR-057b tracked-links docs + amazon account env keys', () => {
  it('docs/tracked-links.md documents JWT userId tenant and .env account rules', () => {
    const p = path.join(root, 'docs', 'tracked-links.md');
    assert.ok(fs.existsSync(p), 'docs/tracked-links.md required');
    const text = fs.readFileSync(p, 'utf8');
    assert.match(text, /userId/);
    assert.match(text, /JWT/i);
    assert.match(text, /tenant/i);
    assert.match(text, /buildTrackedUrl/);
    assert.match(text, /AMAZON_PARTNER_TAG/);
    assert.match(text, /\.env/);
    assert.doesNotMatch(text, /sk_live|AKIA[0-9A-Z]{16}|password\s*=\s*\S+/i);
  });

  it('amazon .env.example lists AMAZON_PARTNER_TAG as tracked-link account key', () => {
    const p = path.join(root, 'providers', 'live', 'amazon', '.env.example');
    assert.ok(fs.existsSync(p), 'providers/live/amazon/.env.example required');
    const text = fs.readFileSync(p, 'utf8');
    assert.match(text, /AMAZON_PARTNER_TAG/);
    assert.match(text, /tracked|FR-057|affiliate|account/i);
    // placeholders only — no secret-looking assignments
    assert.doesNotMatch(text, /AMAZON_PARTNER_TAG=\S+/);
    assert.match(text, /AMAZON_PARTNER_TAG=\s*$/m);
  });
});
