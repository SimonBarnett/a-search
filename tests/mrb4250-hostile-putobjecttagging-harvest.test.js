'use strict';

/**
 * docs/mrb-4250 hostile: PutObjectTagging on RedqueenAClubsAnnotate harvest lesson.
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
  'APartsGateway annotator IAM: PutObjectTagging must sit on the RedqueenAClubsAnnotate statement itself; a Lambda-role grant is not enough and the next deploy drops an interim IAM patch.';

describe('MRB #4250 hostile PutObjectTagging harvest lesson', () => {
  it('lesson contiguous ASCII; SKILL no BOM / no non-ASCII', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    for (let i = 0; i < buf.length; i++) {
      assert.ok(buf[i] < 128, 'non-ASCII at ' + i);
    }
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous PutObjectTagging lesson');
    assert.ok(text.includes('RedqueenAClubsAnnotate'), 'RedqueenAClubsAnnotate');
    assert.ok(text.includes('PutObjectTagging'), 'PutObjectTagging');
    assert.equal(text.includes('\u2014'), false, 'no em-dash');
  });
});
