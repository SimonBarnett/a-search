'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sqlDir = path.join(__dirname, '..', 'maintainer', 'sql');

function read(name) {
  return fs.readFileSync(path.join(sqlDir, name), 'utf8');
}

describe('FR-011 SQL DDL migrations', () => {
  it('migration scripts and README exist', () => {
    for (const name of [
      'README.md',
      '001_PartFeedKeys.sql',
      '002_Parts.sql',
      '003_PartsStaging.sql',
    ]) {
      assert.ok(fs.existsSync(path.join(sqlDir, name)), name);
    }
  });

  it('scripts are migrate-once IF NOT EXISTS / OBJECT_ID IS NULL', () => {
    for (const name of [
      '001_PartFeedKeys.sql',
      '002_Parts.sql',
      '003_PartsStaging.sql',
    ]) {
      const text = read(name);
      assert.match(text, /IF OBJECT_ID/i);
      assert.match(text, /IS NULL/i);
    }
    const readme = read('README.md');
    assert.match(readme, /migrate-once|IF NOT EXISTS/i);
  });

  it('PartFeedKeys / Parts / PartsStaging include Env', () => {
    assert.match(read('001_PartFeedKeys.sql'), /\bEnv\b/);
    assert.match(read('002_Parts.sql'), /\bEnv\b/);
    assert.match(read('003_PartsStaging.sql'), /\bEnv\b/);
  });

  it('Parts natural key (Source, FeedKey, MerchantProductId, Env)', () => {
    const text = read('002_Parts.sql');
    assert.match(text, /PK_Parts/i);
    assert.match(
      text,
      /PRIMARY KEY[\s\S]*Source[\s\S]*FeedKey[\s\S]*MerchantProductId[\s\S]*Env/i,
    );
  });

  it('PartsStaging shares the same natural key shape', () => {
    const text = read('003_PartsStaging.sql');
    assert.match(
      text,
      /PRIMARY KEY[\s\S]*Source[\s\S]*FeedKey[\s\S]*MerchantProductId[\s\S]*Env/i,
    );
  });
});
