'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const entry = path.join(__dirname, '..', 'entry');

describe('MRB #34 hostile: FR-003 entry scaffold', () => {
  it('handler exports; unauthenticated call is not a 501 stub (FR-005)', async () => {
    const { handler } = require(path.join(entry, 'src', 'index.js'));
    assert.equal(typeof handler, 'function');
    const res = await handler({}, {});
    // FR-003 stub returned 501; FR-005 accept path returns 401 without Authorization.
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.accepted, false);
    assert.equal(body.error, 'unauthorized');
  });

  it('skill CAST IRON: entry JWT_*/A_SEARCH_ENV only; no provider secret assignment lines', () => {
    const skill = fs.readFileSync(
      path.join(entry, '.grok', 'skills', 'a-search-entry', 'SKILL.md'),
      'utf8'
    );
    assert.match(skill, /POST\s+\/search/i);
    assert.match(skill, /userId/);
    assert.match(skill, /A_SEARCH_ENV|JWT_/);
    assert.doesNotMatch(skill, /AWS_SECRET_ACCESS_KEY\s*=/);
  });

  it('AGENTS.md points agents at entry CWD and forbids provider secrets', () => {
    const agents = fs.readFileSync(path.join(entry, 'AGENTS.md'), 'utf8');
    assert.match(agents, /entry/i);
    assert.match(agents, /POST\s+\/search|JWT/i);
  });

  it('.env.example assignment keys are A_SEARCH_ENV, JWT_*, or SQS_*_URL', () => {
    const text = fs.readFileSync(path.join(entry, '.env.example'), 'utf8');
    const assigns = [...text.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]);
    assert.ok(assigns.includes('A_SEARCH_ENV'));
    assert.ok(assigns.some((k) => k.startsWith('JWT_')));
    for (const k of assigns) {
      assert.ok(
        k === 'A_SEARCH_ENV' ||
          k.startsWith('JWT_') ||
          /^SQS_[A-Z0-9_]+_URL$/.test(k),
        `unexpected env key ${k}`,
      );
    }
  });
});
