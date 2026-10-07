'use strict';

/** FR-049d: impact onboarding folder scaffold */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const onboarding = path.join(
  root,
  'providers',
  'local',
  'impact',
  'onboarding',
);

describe('FR-049d impact onboarding scaffold', () => {
  it('AGENTS, skill, .env.example, src/run.js exist', () => {
    assert.ok(fs.existsSync(path.join(onboarding, 'AGENTS.md')));
    assert.ok(fs.existsSync(path.join(onboarding, '.env.example')));
    assert.ok(
      fs.existsSync(
        path.join(
          onboarding,
          '.grok',
          'skills',
          'a-search-impact-onboarding',
          'SKILL.md',
        ),
      ),
    );
    assert.ok(fs.existsSync(path.join(onboarding, 'src', 'run.js')));
  });

  it('exports runOnce with remaining shape', async () => {
    const { runOnce } = require('../providers/local/impact/onboarding/src/run');
    assert.equal(typeof runOnce, 'function');
    const out = await runOnce({});
    assert.equal(typeof out.processed, 'number');
    assert.equal(typeof out.remaining, 'number');
    assert.ok(Array.isArray(out.signups));
    assert.equal(out.remaining, 0);
  });
});
