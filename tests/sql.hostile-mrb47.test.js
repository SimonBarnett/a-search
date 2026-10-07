'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sqlDir = path.join(__dirname, '..', 'maintainer', 'sql');

function read(name) {
  return fs.readFileSync(path.join(sqlDir, name), 'utf8');
}

describe('MRB #47 hostile: FR-011 SQL DDL', () => {
  it('migrate-once IF OBJECT_ID IS NULL on all three scripts', () => {
    for (const name of ['001_PartFeedKeys.sql', '002_Parts.sql', '003_PartsStaging.sql']) {
      const text = read(name);
      assert.match(text, /IF OBJECT_ID/i);
      assert.match(text, /IS NULL/i);
      assert.match(text, /\bEnv\b/);
    }
  });

  it('Parts natural key includes Source FeedKey MerchantProductId Env', () => {
    const text = read('002_Parts.sql');
    assert.match(
      text,
      /PRIMARY KEY[\s\S]*Source[\s\S]*FeedKey[\s\S]*MerchantProductId[\s\S]*Env/i
    );
  });
});
