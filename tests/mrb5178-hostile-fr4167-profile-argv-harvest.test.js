'use strict';

/**
 * docs/mrb-5178 hostile: fr4167 pin retarget after FolderS3 --profile argv reshape.
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
  'When FolderS3 aws calls move to @(--profile, s3api, get-object, --bucket) argv, retarget fr4167 Continue/LASTEXITCODE pins off contiguous aws s3api get-object --bucket strings; keep --profile assert.';

describe('MRB #5178 hostile fr4167 FolderS3 --profile argv harvest lesson', () => {
  it('lesson contiguous ASCII; SKILL no BOM / no non-ASCII', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    for (let i = 0; i < buf.length; i++) {
      assert.ok(buf[i] < 128, 'non-ASCII at ' + i);
    }
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous fr4167 retarget lesson');
    assert.ok(text.includes('fr4167'), 'fr4167');
    assert.ok(text.includes('--profile assert'), '--profile assert');
    assert.equal(text.includes('\u2014'), false, 'no em-dash');
  });
});
