'use strict';

/**
 * MRB #1172 hostile pin: GHA Linux quoted-glob / run-tests.js harvest lesson
 * contiguous (ASCII) in harvest-agent-skills.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(
  ROOT,
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

const NEEDLE =
  'GitHub Actions on Linux: quoted node --test tests/**/*.test.js is a literal path -> use scripts/run-tests.js walker + --test-concurrency=1; fleet-only validate-vision-pack.py paths break CI until vendored';

test('mrb1172: GHA Linux test-walker lesson contiguous ASCII in harvest-agent-skills', () => {
  const raw = fs.readFileSync(SKILL);
  assert.equal(raw[0], 0x2d, 'SKILL.md must be UTF-8 without BOM (starts with bullet -)');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'GHA Linux harvest lesson must stay contiguous');
  assert.ok(
    text.includes('scripts/run-tests.js'),
    'must cite scripts/run-tests.js walker',
  );
  assert.ok(
    text.includes('--test-concurrency=1'),
    'must cite --test-concurrency=1',
  );
  assert.ok(
    text.includes('validate-vision-pack.py'),
    'must cite validate-vision-pack.py vendoring gap',
  );
  // Fail-when: mojibake em-dash remnants (cp1252/utf8 double-encode)
  assert.doesNotMatch(
    text,
    /literal path \u00e2|\u2014|\u2013/,
    'lesson must use ASCII -> not mojibake/em-dash',
  );
});

test('mrb1172: package.json test script uses run-tests.js walker', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  );
  assert.match(String(pkg.scripts && pkg.scripts.test), /scripts\/run-tests\.js/);
  assert.ok(
    fs.existsSync(path.join(ROOT, 'scripts', 'run-tests.js')),
    'scripts/run-tests.js missing',
  );
  const runner = fs.readFileSync(
    path.join(ROOT, 'scripts', 'run-tests.js'),
    'utf8',
  );
  assert.match(runner, /--test-concurrency=1/);
  assert.match(runner, /readdirSync/);
});
