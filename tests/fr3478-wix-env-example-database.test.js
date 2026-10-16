'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'providers', 'local', 'wix', '.env.example');

describe('FR #3478 wix env example live target', () => {
  it('names a_search and does not name the read-only catalogue database', () => {
    const text = fs.readFileSync(FILE, 'utf8');
    assert.match(text, /^MSSQL_DATABASE=a_search$/m);
    assert.match(text, /^# Live target: a_search \(docs\/environments\.md FR-119, FR-251\)$/m);
    assert.equal(text.includes('madeiradb'), false);
  });
});
