'use strict';

/**
 * docs/mrb-4206 hostile pin: affiliate import SQS MRB lesson contiguous ASCII
 * in harvest-agent-skills (normalizeImportFiles / fileCount-only / --auto).
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
  'MRB affiliate import SQS: pin normalizeImportFiles drops feedurl/secrets from MessageBody; wake notify is fileCount-only; one docs/mrb hostile PR; PASS with --auto without live drain';

describe('MRB #4206 hostile affiliate import SQS harvest lesson', () => {
  it('lesson contiguous ASCII; SKILL no BOM / no non-ASCII', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    for (let i = 0; i < buf.length; i++) {
      assert.ok(buf[i] < 128, 'non-ASCII at ' + i);
    }
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous normalizeImportFiles / fileCount-only lesson');
    assert.ok(text.includes('normalizeImportFiles'), 'normalizeImportFiles');
    assert.ok(text.includes('fileCount-only'), 'fileCount-only');
    assert.equal(text.includes('\u2014'), false, 'no em-dash');
  });
});
