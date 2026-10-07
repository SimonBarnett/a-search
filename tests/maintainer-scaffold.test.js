'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const maintainer = path.join(root, 'maintainer');

const REQUIRED = [
  'AGENTS.md',
  path.join('.grok', 'skills', 'a-search-maintainer', 'SKILL.md'),
  '.env.example',
  path.join('src', 'schedule.js'),
];

describe('FR-010 maintainer scaffold', () => {
  it('required maintainer paths exist', () => {
    for (const rel of REQUIRED) {
      const p = path.join(maintainer, rel);
      assert.ok(fs.existsSync(p), `missing ${path.join('maintainer', rel)}`);
    }
  });

  it('a-search-maintainer skill covers roll + conditional download + MERGE', () => {
    const skillPath = path.join(
      maintainer,
      '.grok',
      'skills',
      'a-search-maintainer',
      'SKILL.md',
    );
    const text = fs.readFileSync(skillPath, 'utf8');
    assert.match(text, /roll/i);
    assert.match(text, /conditional/i);
    assert.match(text, /MERGE/i);
    assert.match(text, /MAINTAINER_TOP|NextCheck/i);
  });

  it('.env.example has MSSQL, MAINTAINER_TOP, A_SEARCH_ENV', () => {
    const text = fs.readFileSync(path.join(maintainer, '.env.example'), 'utf8');
    assert.match(text, /MSSQL|SQL_/i);
    assert.match(text, /MAINTAINER_TOP/);
    assert.match(text, /A_SEARCH_ENV/);
  });
});
