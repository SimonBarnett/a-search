'use strict';

/**
 * MRB #5001: hostile pin - a-sqlsearch SEA loads msnodesqlv8 via
 * module.createRequire(process.execPath); keep legacy drain until
 * -ReplaceLegacySqlDrain after smoke.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

const NEEDLE =
  'a-sqlsearch SEA cannot plain-require msnodesqlv8 (ERR_UNKNOWN_BUILTIN_MODULE): load with module.createRequire(process.execPath) from node_modules beside the exe; keep a-search-walrus-sql-drain until -ReplaceLegacySqlDrain after smoke-a-sqlsearch-trusted-select.';

describe('MRB #5001 hostile SEA msnodesqlv8 createRequire lesson', () => {
  it('SKILL.md UTF-8 no-BOM pure ASCII', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    for (let i = 0; i < buf.length; i++) {
      assert.ok(buf[i] < 128, 'non-ASCII at ' + i);
    }
  });

  it('pins contiguous SEA createRequire lesson', () => {
    const text = fs.readFileSync(SKILL, 'utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous createRequire needle');
    assert.ok(text.includes('ERR_UNKNOWN_BUILTIN_MODULE'));
    assert.ok(text.includes('-ReplaceLegacySqlDrain'));
    assert.equal(text.includes('\u2014'), false, 'no em-dash');
  });
});
