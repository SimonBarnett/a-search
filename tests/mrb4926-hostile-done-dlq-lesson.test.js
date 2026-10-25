'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('MRB #4926 harvest pin DONE=dlq transient', () => {
  it('keeps DONE=dlq maxReceiveCount bullet and main tail siblings', () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        '.grok',
        'skills',
        'harvest-agent-skills',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(
      src,
      /MRB hasresults\/DONE: transient 429\/502-504 are not isProviderFaultForDlq --- write DONE=dlq on ApproximateReceiveCount>=maxReceiveCount before throw or SQS redrive leaves hasresults stuck/,
    );
    assert.match(src, /FR with open Needs Simon decision stamps/);
    assert.match(src, /unlanded hasresults\/enabled plus an owner host choice/);
  });
});
