'use strict';

/**
 * docs/mrb-4259 hostile: host affiliate brief vs GUID page annotation harvest lesson.
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
  'Host annotation is an affiliate brief (club, audience, opportunities). GUID annotation describes only that page using the host brief plus title and meta, and must be rejected when it copies the host text. REDQUEEN_REANNOTATE=1 rewrites markers that are already annotated.';

describe('MRB #4259 hostile host vs GUID annotation harvest lesson', () => {
  it('lesson contiguous ASCII; SKILL no BOM / no non-ASCII', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    for (let i = 0; i < buf.length; i++) {
      assert.ok(buf[i] < 128, 'non-ASCII at ' + i);
    }
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous host/GUID annotation lesson');
    assert.ok(text.includes('affiliate brief'), 'affiliate brief');
    assert.ok(text.includes('REDQUEEN_REANNOTATE=1'), 'REDQUEEN_REANNOTATE');
    assert.ok(text.includes('copies the host text'), 'reject host copy');
    assert.equal(text.includes('\u2014'), false, 'no em-dash');
  });
});
