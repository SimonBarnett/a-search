'use strict';

/**
 * FR-3355 / #3355: in_ready fires on IN/{searchId}.json, not legacy in.json;
 * exclude IN/.processing/ and agent outputs.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  classifyWidgetS3Key,
  isInReadyKey,
  IN_READY_EVENT,
} = require('../shared/widgets/agentEventClassify');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'fr', 'FR-3355.md');
const EVENTS = path.join(ROOT, 'docs', 'agentic-searches-events.md');

describe('FR-3355 in_ready EventBridge suffix = IN/', () => {
  it('isInReadyKey true only for ready IN/*.json under widget tree', () => {
    assert.equal(IN_READY_EVENT, 'in_ready');
    assert.equal(
      isInReadyKey('sandbox/x/42/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/IN/search-1.json'),
      true,
    );
    assert.equal(
      isInReadyKey('live/x/99/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/IN/batch.json'),
      true,
    );
    // legacy single file must NOT trigger after FR-3344
    assert.equal(
      isInReadyKey('sandbox/x/42/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/in.json'),
      false,
    );
    assert.equal(
      isInReadyKey(
        'sandbox/x/42/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/IN/.processing/search-1.json',
      ),
      false,
    );
    assert.equal(
      isInReadyKey('sandbox/x/42/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/live.json'),
      false,
    );
    assert.equal(
      isInReadyKey('sandbox/x/42/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/IN/readme.md'),
      false,
    );
  });

  it('classifyWidgetS3Key returns in_ready with parsed ids for IN/ files', () => {
    const r = classifyWidgetS3Key(
      'sandbox/x/42/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/IN/s1.json',
    );
    assert.equal(r.eventType, 'in_ready');
    assert.equal(r.env, 'sandbox');
    assert.equal(r.customerNumber, '42');
    assert.equal(r.widgetGuid, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    assert.equal(r.searchId, 's1');
  });

  it('docs/fr/FR-3355.md + agentic-searches-events.md lock IN/ suffix ASCII', () => {
    for (const p of [DOC, EVENTS]) {
      const buf = fs.readFileSync(p);
      assert.notEqual(buf[0], 0xef, `${path.basename(p)} UTF-8 no BOM`);
      for (const b of buf) assert.ok(b < 128, `${path.basename(p)} must be ASCII`);
      const text = buf.toString('utf8');
      assert.match(text, /in_ready/);
      assert.match(text, /IN\//);
      assert.match(text, /\.processing/);
      assert.match(
        text,
        /in_ready[^\n]{0,120}IN\//,
        `${path.basename(p)} must pin in_ready on IN/`,
      );
    }
    const fr = fs.readFileSync(DOC, 'utf8');
    assert.match(fr, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(fr, /FR-3344/);
    assert.match(
      fr,
      /\{env\}\/x\/\{customerNumber\}\/\{widgetGuid\}\/IN\/\{searchId\}\.json/,
    );
  });
});
