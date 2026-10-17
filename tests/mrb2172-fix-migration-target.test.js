'use strict';

/**
 * fix/mrb-2172: pin migration 017 -- target: a_search (FR-251).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('fix/mrb-2172 FR-239 migration target header', () => {
  it('017_ShopInvoices_StripeEvents.sql first line is -- target: a_search', () => {
    const sql = fs.readFileSync(
      path.join(ROOT, 'db', 'migrations', '017_ShopInvoices_StripeEvents.sql'),
      'utf8',
    );
    const first = sql
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    assert.match(first, /^--\s*target:\s*a_search\b/i);
    assert.match(sql, /Never modify madeiradb/i);
    assert.doesNotMatch(sql, /\bUSE\s+\[?madeiradb\]?/i);
  });
});
