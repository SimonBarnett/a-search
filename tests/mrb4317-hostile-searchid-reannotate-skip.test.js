'use strict';

/**
 * docs/mrb-4317 hostile pin: existing searchid skips REDQUEEN_REANNOTATE
 * review and POST; a failed POST of a queries-only file stays a guid retry.
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
  'When searches.json already has a searchid, REDQUEEN_REANNOTATE must not review the host or GUID and must not POST again. A failed POST of a queries-only file is a guid retry and drainOnce must not delete the FIFO message.';

const PRIOR =
  'An annotated GUID whose searches.json has queries and no searchid is posted once without a new review, and a failed POST must leave the FIFO message for retry.';

describe('MRB #4317 hostile searchid reannotate skip', () => {
  it('pins the searchid skip next to the queries-only post-once lesson', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    assert.equal(buf[buf.length - 1], 0x0a, 'trailing newline');
    const text = buf.toString('utf8');
    const priorAt = text.indexOf(PRIOR);
    const needleAt = text.indexOf(NEEDLE);
    assert.ok(priorAt >= 0, 'prior no-searchid lesson still present');
    assert.ok(needleAt > priorAt, 'searchid skip lesson follows the no-searchid bullet');
  });
});
