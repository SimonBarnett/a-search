'use strict';

/** FR-114: docs/identity.md + 8-char user_id alignment pins */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const doc = path.join(root, 'docs', 'identity.md');
const createSrc = path.join(
  root,
  'providers',
  'local',
  'awin',
  'onboarding',
  'src',
  'createMerchantUser.js',
);

describe('FR-114 docs/identity.md', () => {
  it('docs/identity.md exists and covers code format + open Partner question', () => {
    assert.ok(fs.existsSync(doc), 'missing docs/identity.md');
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(text, /\[0-9A-Z\]\{8\}|\^\[0-9A-Z\]\{8\}\$/);
    assert.match(text, /GenerateUniqueUserId/);
    assert.match(text, /Users\.user_id|user_id varchar\(8\)/);
    assert.match(text, /Partner/);
    assert.match(text, /open question|disagreement|not authoritative/i);
    assert.match(text, /clubscan/);
    assert.match(text, /referrer/i);
    assert.match(text, /JWT|userId/);
    assert.doesNotMatch(text, /@gmail\.com|@hotmail\.com/i);
  });

  it('doc names table columns that hold codes', () => {
    const text = fs.readFileSync(doc, 'utf8');
    for (const needle of [
      'Catalog.UserId',
      'Products.UserId',
      'MerchantProducts.UserId',
      'RejectedAsins.UserId',
      'UserCategories.uid',
      'UserApiKeys.user_id',
      'Partner.PartnerID',
      'clubscan.ClubID',
      'clubscan.PartnerId',
    ]) {
      assert.match(text, new RegExp(needle.replace('.', '\\.')), needle);
    }
  });

  it('README links identity.md', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/identity\.md/);
  });
});

describe('FR-114 no usr_ emit paths', () => {
  it('createMerchantUser source has no usr_ default', () => {
    const src = fs.readFileSync(createSrc, 'utf8');
    assert.doesNotMatch(src, /usr_/);
    assert.match(src, /newUserId/);
    assert.match(src, /missing_newUserId|requires.*newUserId/i);
  });

  it('repo JS under providers+entry+shared has no usr_ string literals', () => {
    const roots = ['providers', 'entry', 'shared'].map((d) => path.join(root, d));
    /** @type {string[]} */
    const hits = [];
    function walk(dir) {
      if (!fs.existsSync(dir)) return;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === 'node_modules') continue;
          walk(p);
        } else if (ent.isFile() && ent.name.endsWith('.js')) {
          const text = fs.readFileSync(p, 'utf8');
          if (text.includes('usr_')) hits.push(path.relative(root, p));
        }
      }
    }
    for (const r of roots) walk(r);
    assert.deepEqual(hits, [], 'usr_ remains in: ' + hits.join(', '));
  });
});
