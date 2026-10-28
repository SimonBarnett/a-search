'use strict';

/**
 * MRB #5260 hostile pins for FR #5257: drop loose hobbyzone* unless a model
 * gate is present; brand-only yields no SELECT.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  LOOSE_BRAND_PREFIXES,
  refineLooseBrandPrefixGates,
  extractBrandModelGateTokens,
  formatBrandGate,
} = require('../providers/local/sql/src/queryParts');

describe('MRB #5260 hostile: FR #5257 loose hobbyzone brand prefix', () => {
  it('LOOSE_BRAND_PREFIXES lists hobbyzone only (volantex not loose)', () => {
    assert.ok(LOOSE_BRAND_PREFIXES.has('hobbyzone'));
    assert.equal(LOOSE_BRAND_PREFIXES.has('volantex'), false);
  });

  it('refineLooseBrandPrefixGates returns [] when only loose brand prefixes', () => {
    assert.deepEqual(refineLooseBrandPrefixGates(['"hobbyzone*"']), []);
    assert.deepEqual(
      refineLooseBrandPrefixGates(['"hobbyzone*"', '"hobbyzone*"']),
      [],
    );
  });

  it('refineLooseBrandPrefixGates drops loose brand when exact model present', () => {
    const out = refineLooseBrandPrefixGates([
      '"hobbyzone*"',
      '"carbon cub"',
      '"HBZ3200"',
    ]);
    assert.equal(out.some((g) => /hobbyzone\*/i.test(g)), false);
    assert.ok(out.some((g) => /carbon cub/i.test(g)));
    assert.ok(out.some((g) => /HBZ3200/i.test(g)));
  });

  it('refineLooseBrandPrefixGates leaves volantex* untouched', () => {
    const gates = ['"volantex*"', '"sport cub"'];
    assert.deepEqual(refineLooseBrandPrefixGates(gates), gates);
  });

  it('extractBrandModelGateTokens brand-only Hobbyzone => no gates', () => {
    const gates = extractBrandModelGateTokens({
      queries: [{ q: 'Hobbyzone', maxResults: 10 }],
    });
    assert.equal(gates.length, 0, String(gates));
  });

  it('docs/walrus-sql-drain.md pins FR #5257 contiguous LOOSE_BRAND_PREFIXES rule', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(text, /FR #5257/);
    assert.match(text, /LOOSE_BRAND_PREFIXES/);
    assert.match(text, /hobbyzone\*/);
    assert.match(text, /volantex\*/);
    assert.match(
      text,
      /If they are the only gates, return `\[\]`[\s\S]{0,40}\(no SELECT\)/i,
    );
  });

  it('queryParts exports refineLooseBrandPrefixGates and LOOSE_BRAND_PREFIXES', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'providers', 'local', 'sql', 'src', 'queryParts.js'),
      'utf8',
    );
    assert.match(src, /const LOOSE_BRAND_PREFIXES = new Set\(\['hobbyzone'\]\)/);
    assert.match(src, /function refineLooseBrandPrefixGates/);
    assert.match(src, /refineLooseBrandPrefixGates,/);
    assert.match(src, /LOOSE_BRAND_PREFIXES,/);
    assert.equal(typeof formatBrandGate, 'function');
  });
});
