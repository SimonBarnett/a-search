'use strict';

/**
 * MRB #612 hostile: fakeSecrets keep-both with redaction/intake migrations.
 * Refs SimonBarnett/a-search#612 / #611 / bobiverse#3304
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const fake = require('./fixtures/fakeSecrets');

const MIGRATED = [
  'tests/fixtures/fakeSecrets.js',
  'tests/fr048b-redact.test.js',
  'tests/report-exception.test.js',
  'tests/fr059e-selftest-intake.test.js',
];

describe('MRB #612 hostile fakeSecrets', () => {
  it('exports joinParts, reLiteral, reFromParts, and fixture builders', () => {
    for (const k of [
      'joinParts',
      'reLiteral',
      'reFromParts',
      'redactFixtureBody',
      'reportExceptionSecretMessage',
      'selftestBearerSecret',
      'fakeDummyJwt',
      'fakeAwsExampleAccessKey',
    ]) {
      assert.equal(typeof fake[k], 'function', k);
    }
    assert.ok(fake.joinParts(['a', 'b']) === 'ab');
    assert.ok(fake.fakeDummyJwt().split('.').length === 3);
  });

  it('migrated suites require fixtures/fakeSecrets', () => {
    for (const rel of MIGRATED.slice(1)) {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      assert.match(text, /fixtures\/fakeSecrets/, rel);
    }
  });

  it('migrated sources have no contiguous Authorization Bearer eyJ blob', () => {
    const banned = /Authorization:\s*Bearer\s+eyJ[A-Za-z0-9_-]+/;
    for (const rel of MIGRATED) {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      assert.doesNotMatch(text, banned, rel);
    }
  });

  it('AGENTS and harvest-agent-skills document fakeSecrets playbook', () => {
    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    const skill = fs.readFileSync(
      path.join(root, '.grok/skills/harvest-agent-skills/SKILL.md'),
      'utf8',
    );
    assert.match(agents, /tests\/fixtures\/fakeSecrets\.js/);
    assert.match(agents, /#611|#3304/);
    assert.match(skill, /fakeSecrets\.js/);
    assert.match(skill, /GitGuardian/);
  });

  it('helper source builds JWT header from joinParts not one literal', () => {
    const src = fs.readFileSync(
      path.join(root, 'tests/fixtures/fakeSecrets.js'),
      'utf8',
    );
    assert.match(src, /joinParts\(\['eyJ'/);
    assert.doesNotMatch(src, /['"]eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9['"]/);
  });
});
