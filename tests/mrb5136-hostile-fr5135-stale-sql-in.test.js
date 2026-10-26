'use strict';

/**
 * MRB #5136 / FR #5135: hostile pins --- stale IN/sql.json must not survive 0-product SQL.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('MRB #5136 hostile FR #5135 stale IN/sql.json', () => {
  it('sql worker deletes fixed IN/sql.json on zero products', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'providers', 'local', 'sql', 'src', 'worker.js'),
      'utf8',
    );
    assert.match(src, /products\.length === 0/);
    assert.match(src, /sqlInResultKey/);
    assert.match(src, /deps\.deleteObject/);
    assert.match(src, /NoSuchKey/);
  });

  it('walrus drain removes sql IN on zero products and wires deleteObject', () => {
    const run = fs.readFileSync(
      path.join(ROOT, 'walrus', 'src', 'runJob.js'),
      'utf8',
    );
    assert.match(run, /FR #5135/);
    assert.match(run, /removeAClubsSqlIn/);
    assert.match(run, /createAClubsDeleteObject/);
    assert.match(run, /deleteObject/);
    const write = fs.readFileSync(
      path.join(ROOT, 'walrus', 'src', 'writeAClubsIn.js'),
      'utf8',
    );
    assert.match(write, /function removeAClubsSqlIn/);
    assert.match(write, /function createAClubsDeleteObject/);
    assert.match(write, /IN\/sql\.json/);
  });

  it('promoteInToLive skips mismatched searchid on IN/sql.json only', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'shared', 'widgets', 'promoteInToLive.js'),
      'utf8',
    );
    assert.match(src, /currentSearchid/);
    assert.match(src, /\/in\/sql\.json/);
    assert.match(src, /search-fanout\.json/);
    assert.match(src, /objectSearchid/);
  });

  it('docs pin FR #5135 stale sql.json behaviour', () => {
    const fanout = fs.readFileSync(
      path.join(ROOT, 'docs', 'search-fanout.md'),
      'utf8',
    );
    const drain = fs.readFileSync(
      path.join(ROOT, 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(fanout, /FR #5135/);
    assert.match(drain, /FR #5135/);
    assert.match(fanout + drain, /sql\.json/);
  });
});
