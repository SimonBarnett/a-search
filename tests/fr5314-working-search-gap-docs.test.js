'use strict';

/**
 * Park #5314: working-search gap note and FR mirrors exist.
 * Implementation stays on #5315-#5326.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const note = path.join(
  root,
  'docs',
  'feature-request-working-search-gap-2026-11-12.md',
);
const issued = path.join(
  root,
  'docs',
  'fr',
  'ISSUED-WORKING-SEARCH-20261112.tsv',
);

const impl = [
  '5315',
  '5316',
  '5317',
  '5318',
  '5319',
  '5320',
  '5321',
  '5322',
  '5323',
  '5324',
  '5325',
  '5326',
];

function read(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.ok(
    !(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf),
    `${rel} must be UTF-8 without BOM`,
  );
  const text = buf.toString('utf8');
  assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(text), `${rel} must be ASCII`);
  return text;
}

describe('FR #5314 working-search gap docs', () => {
  it('note names the SHA and every implementation issue', () => {
    const text = read(
      'docs/feature-request-working-search-gap-2026-11-12.md',
    );
    assert.match(text, /3ec6d8f00643c3389bc1f36d9e376a8dcb1de50f/);
    assert.match(text, /#5314/);
    for (const n of impl) {
      assert.match(text, new RegExp(`#${n}\\b`));
      const mirror = `docs/fr/FR-${n}.md`;
      const body = read(mirror);
      assert.match(body, new RegExp(`#${n}\\b`));
      assert.match(body, /## Goal/);
      assert.match(body, /## Testable/);
    }
  });

  it('issued table lists 5314 through 5326', () => {
    assert.ok(fs.existsSync(note));
    const text = read('docs/fr/ISSUED-WORKING-SEARCH-20261112.tsv');
    assert.match(text, /^5314\t/m);
    assert.match(text, /^5326\t/m);
    assert.ok(fs.existsSync(issued));
  });
});
