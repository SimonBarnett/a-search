'use strict';

/**
 * FR-445: handler unit tests must mock reportException (no live intake noise).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const amazonHandlerTest = path.join(root, 'tests', 'amazon-handler.test.js');
const entryIntakeTest = path.join(root, 'tests', 'fr048c-entry-intake.test.js');
const amazonIntakeTest = path.join(root, 'tests', 'fr048d-amazon-intake.test.js');

describe('FR-445 handler tests mock reportException', () => {
  it('amazon-handler.test.js injects reportException on handler calls', () => {
    const text = fs.readFileSync(amazonHandlerTest, 'utf8');
    assert.match(text, /function mockIntakeDeps/);
    assert.match(text, /\{not-json/);
    assert.match(text, /live intake/i);
    const injected = text.match(/reportException:\s*intake\.reportException/g) || [];
    assert.ok(
      injected.length >= 3,
      `expected reportException mock on each handler call, got ${injected.length}`,
    );
    const fetchPins = text.match(/fetch:\s*intake\.fetch/g) || [];
    assert.ok(fetchPins.length >= 3, `expected fetch mock pins, got ${fetchPins.length}`);
  });

  it('FR-048c/d intake wiring tests already inject reportException', () => {
    for (const p of [entryIntakeTest, amazonIntakeTest]) {
      const text = fs.readFileSync(p, 'utf8');
      assert.match(text, /reportException:\s*async/, path.basename(p));
    }
  });

  it('bad JSON path with mock never hits intake URL', async () => {
    const { handler } = require('../providers/live/amazon/src/handler');
    const fetches = [];
    const reports = [];
    await assert.rejects(
      () =>
        handler(
          { Records: [{ body: '{not-json' }] },
          {
            run: async () => ({}),
            reportException: async (opts) => {
              reports.push(opts);
              return { ok: true };
            },
            fetch: async (url) => {
              fetches.push(url);
              return { status: 200, text: async () => '' };
            },
          },
        ),
      /JSON/i,
    );
    assert.equal(reports.length, 1);
    assert.equal(fetches.length, 0);
  });
});
