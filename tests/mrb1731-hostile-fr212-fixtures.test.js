'use strict';

/**
 * MRB #1731 hostile pins for FR-212 ComponentsPiece JSON fixtures.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(ROOT, 'tests', 'fixtures', 'components-piece');
const FR = path.join(ROOT, 'docs', 'fr', 'FR-212.md');
const LIVE_PART_CAP_FREE = 10;
const WIDGET_GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FORBIDDEN_KEY_RE =
  /^(password|passwd|api[_-]?key|secret|token|access[_-]?token|refresh[_-]?token|authorization|bearer|private[_-]?key|nickserv|sasl|ip|ua|user[_-]?id|email|cookie)$/i;

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));
}

function walkKeys(value, visit) {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v) => walkKeys(v, visit));
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    visit(k);
    walkKeys(v, visit);
  }
}

describe('mrb1731 FR-212 JSON fixtures hostile', () => {
  it('live.free length exactly LIVE_PART_CAP_FREE; live.full larger; clean urls', () => {
    const free = readJson('live.free.json');
    const full = readJson('live.full.json');
    assert.equal(free.length, LIVE_PART_CAP_FREE);
    assert.ok(full.length > LIVE_PART_CAP_FREE);
    for (const item of free.concat(full)) {
      assert.equal(typeof item.url, 'string');
      assert.ok(!/(?:[?&#]|^)(?:awinaffid|campid|subId1|u1|tag)=/i.test(item.url));
      assert.ok(['affiliate', 'merchant', 'provider'].includes(item.class));
    }
  });

  it('widgetGuid matches FR-232 regex; no forbidden PII/secret keys on fixtures', () => {
    const widget = readJson('widget.json');
    assert.match(String(widget.widgetGuid), WIDGET_GUID_RE);
    for (const name of fs.readdirSync(FIX).filter((f) => f.endsWith('.json'))) {
      const doc = readJson(name);
      walkKeys(doc, (k) => {
        assert.ok(!FORBIDDEN_KEY_RE.test(k), `${name} forbidden key ${k}`);
      });
    }
  });

  it('FR-212 Decision LOCKED ASCII no-BOM', () => {
    const raw = fs.readFileSync(FR);
    assert.notEqual(raw[0], 0xef);
    for (const b of raw) assert.ok(b < 128);
    const text = raw.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /LIVE_PART_CAP_FREE/);
    assert.match(text, /tests\/fixtures\/components-piece/);
  });
});
