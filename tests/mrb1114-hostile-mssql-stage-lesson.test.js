'use strict';

/**
 * Hostile pin: MRB a-search#1114 harvest-lesson — stage mssql local-only playbook
 * contiguous in harvest-agent-skills after merge.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillPath = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('mrb1114 hostile: stage mssql local-only harvest lesson', () => {
  it('skill book keeps contiguous Stage mssql local + maintainer + fr:131 playbook', () => {
    const text = fs.readFileSync(skillPath, 'utf8');
    assert.match(
      text,
      /Stage mssql only for providers\/local\/\* workers \+ maintainer[\s\S]{0,280}?fr:131/,
    );
    assert.match(text, /stageMssqlNodeModules/);
    assert.match(text, /FR-134 worker S3 SDK staging/);
    assert.match(text, /keep-both SDK copy/);
  });
});
