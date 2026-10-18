'use strict';

/**
 * FR #3495: local provider env examples name a_search as the live writer
 * target (FR-251). Wix is FR #3478 / PR #3494 and is not in this list.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'providers', 'local');
const FILES = [
  'admitad/.env.example',
  'avantlink/.env.example',
  'awin/.env.example',
  'flexoffers/.env.example',
  'impact/.env.example',
  'impact/onboarding/.env.example',
  'partnerize/.env.example',
  'shopify/.env.example',
  'tradedoubler/.env.example',
  'webgains/.env.example',
  'woocommerce/.env.example',
];

const LIVE = /^# Live target: a_search \(docs\/environments\.md FR-119, FR-251\)$/m;

describe('FR #3495 provider env example live target', () => {
  for (const rel of FILES) {
    it(`${rel} names a_search and not the read-only catalogue database`, () => {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      assert.match(text, /^MSSQL_DATABASE=a_search$/m);
      assert.match(text, LIVE);
      assert.equal(text.includes('madeiradb'), false);
    });
  }
});
