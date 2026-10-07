'use strict';

/** FR-049c: awin onboarding folder scaffold */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const onboarding = path.join(root, 'providers', 'local', 'awin', 'onboarding');

describe('FR-049c awin onboarding scaffold', () => {
  it('AGENTS, skill, .env.example, src/run.js exist', () => {
    assert.ok(fs.existsSync(path.join(onboarding, 'AGENTS.md')));
    assert.ok(fs.existsSync(path.join(onboarding, '.env.example')));
    assert.ok(
      fs.existsSync(
        path.join(
          onboarding,
          '.grok',
          'skills',
          'a-search-awin-onboarding',
          'SKILL.md',
        ),
      ),
    );
    assert.ok(fs.existsSync(path.join(onboarding, 'src', 'run.js')));
  });

  it('runOnce returns remaining shape', async () => {
    const { runOnce } = require('../providers/local/awin/onboarding/src/run');
    const out = await runOnce({});
    assert.equal(typeof out.processed, 'number');
    assert.equal(typeof out.remaining, 'number');
    assert.ok(Array.isArray(out.signups));
    assert.equal(out.remaining, 0);
  });

  it('AGENTS + skill mention CAST IRON / intake', () => {
    const agents = fs.readFileSync(path.join(onboarding, 'AGENTS.md'), 'utf8');
    const skill = fs.readFileSync(
      path.join(
        onboarding,
        '.grok',
        'skills',
        'a-search-awin-onboarding',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(agents, /CAST IRON/i);
    assert.match(agents, /SimonBarnett\/a-search/);
    assert.match(skill, /CAST IRON/i);
    assert.match(skill, /remaining/);
  });
});
