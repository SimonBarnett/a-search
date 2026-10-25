'use strict';

/**
 * FR #4947: folder dbimport writes ingest.ImportRuns and Parts.LastSeenRunId.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('FR #4947 dbimport run logging', () => {
  it('sql.js merge stamps LastSeenRunId and inserts ImportRuns', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'tools', 'dbimport', 'sql.js'),
      'utf8',
    );
    assert.match(src, /INSERT INTO ingest\.ImportRuns/);
    assert.match(src, /INSERT INTO ingest\.ImportRunFeeds/);
    assert.match(src, /ingest\.ImportFiles/);
    assert.match(src, /LastSeenRunId\s*=\s*@RunId/);
    const ps = fs.readFileSync(
      path.join(__dirname, '..', 'tools', 'DbImportSql.ps1'),
      'utf8',
    );
    assert.match(ps, /INSERT INTO ingest\.ImportRuns/);
    assert.match(ps, /LastSeenRunId\s*=\s*@RunId/);
  });

  it('importParts dry-run path returns before beginImportRun', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'tools', 'dbimport', 'sql.js'),
      'utf8',
    );
    const fn = src.slice(src.indexOf('async function importParts'));
    const dry = fn.indexOf('if (dryRun)');
    const begin = fn.indexOf('beginImportRun');
    assert.ok(dry > 0 && begin > dry);
  });
});
