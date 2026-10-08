'use strict';

/**
 * a-search#611 / bobiverse#3304: fakeSecrets helper + migrated sources stay
 * free of contiguous GG-triggering secret literals.
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

/** Contiguous shapes that previously tripped GitGuardian (built from parts). */
const BANNED = [
  fake.reFromParts([
    'Authorization:\\s*Bearer\\s+',
    'SECRET',
    'TOKEN',
    '\\s+password=',
    'hunt',
    'er2',
  ]),
  fake.reLiteral(fake.fakeJwtHeaderPayload()),
  fake.reLiteral(fake.fakeJwtHeaderShort()),
  fake.reLiteral(fake.fakePassword()),
  fake.reLiteral(fake.fakeAwsExampleAccessKey()),
  fake.reFromParts(['password=', 'hunt', 'er2']),
  fake.reFromParts(['Bearer ', 'SECRET', 'TOKEN']),
];

describe('FR #611 fakeSecrets fixtures', () => {
  it('helper builds runtime secret-shaped strings', () => {
    assert.ok(fake.fakeDummyJwt().includes('.'));
    assert.equal(fake.fakePassword(), ['Super', 'Secret', '123'].join(''));
    assert.match(fake.redactFixtureBody(), /^Authorization:/m);
    assert.doesNotMatch(
      fs.readFileSync(path.join(root, 'tests/fixtures/fakeSecrets.js'), 'utf8'),
      /Authorization:\s*Bearer\s+eyJhbGci/,
    );
  });

  it('migrated test sources lack banned contiguous literals', () => {
    for (const rel of MIGRATED) {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      for (const re of BANNED) {
        assert.doesNotMatch(text, re, `${rel} matched ${re}`);
      }
    }
  });

  it('AGENTS + harvest-agent-skills pin the fakeSecrets playbook', () => {
    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    const skill = fs.readFileSync(
      path.join(root, '.grok/skills/harvest-agent-skills/SKILL.md'),
      'utf8',
    );
    assert.match(agents, /fakeSecrets\.js/);
    assert.match(agents, /Never write realistic secret literals/);
    assert.match(skill, /fakeSecrets\.js/);
    assert.match(skill, /GitGuardian/);
  });
});
