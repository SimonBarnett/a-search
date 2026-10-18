'use strict';

/**
 * docs/mrb-4332 hostile pin: agent API key is a generated secret.
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
  'Generate the a-search agent API key with Secrets Manager GenerateSecretString. Put a dynamic reference in A_SEARCH_AGENT_API_KEY and grantRead on the entry Lambda. Output the secret ARN, never the value, and do not take -c agentApiKey.';

const PRIOR =
  'searches.json queries-only repost: copy existing.market and existing.currency onto the POST body and the written doc when searchid lands; q stays product keywords only.';

describe('MRB #4332 hostile agent API key secret', () => {
  it('pins the generated agent key lesson after the queries-only repost bullet', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    assert.equal(buf[buf.length - 1], 0x0a, 'trailing newline');
    const text = buf.toString('utf8');
    const priorAt = text.indexOf(PRIOR);
    const needleAt = text.indexOf(NEEDLE);
    assert.ok(priorAt >= 0, 'queries-only repost lesson still present');
    assert.ok(needleAt > priorAt, 'agent key lesson follows the repost bullet');
  });
});
