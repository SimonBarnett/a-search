'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const maintainer = path.join(__dirname, '..', 'maintainer');

describe('MRB #45 hostile: FR-010 maintainer scaffold', () => {
  it('paths + skill cover roll/conditional/MERGE; schedule stub exports', () => {
    assert.ok(fs.existsSync(path.join(maintainer, 'AGENTS.md')));
    const skill = fs.readFileSync(
      path.join(maintainer, '.grok', 'skills', 'a-search-maintainer', 'SKILL.md'),
      'utf8'
    );
    assert.match(skill, /roll/i);
    assert.match(skill, /conditional/i);
    assert.match(skill, /MERGE/i);
    const { handler } = require(path.join(maintainer, 'src', 'schedule.js'));
    assert.equal(typeof handler, 'function');
  });

  it('.env.example is MSSQL + schedule knobs only (no provider secrets)', () => {
    const text = fs.readFileSync(path.join(maintainer, '.env.example'), 'utf8');
    const assigns = [...text.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]);
    assert.ok(assigns.includes('A_SEARCH_ENV'));
    assert.ok(assigns.includes('MAINTAINER_TOP'));
    assert.ok(assigns.some((k) => /MSSQL|SQL_/i.test(k)));
    for (const k of assigns) {
      assert.doesNotMatch(k, /AWS_SECRET|PROVIDER_|FEED_API_KEY/i);
    }
  });
});
