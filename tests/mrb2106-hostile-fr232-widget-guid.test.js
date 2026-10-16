'use strict';

/**
 * docs/mrb-2106 hostile pin for FR-232 widgetGuid mint store (PR #2106 / #1346).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB-2106 FR-232 widgetGuid hostile', () => {
  it('FR-232 Decision LOCKED UTF-8 no-BOM; supersedes FR-211', () => {
    const buf = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-232.md'));
    assert.notEqual(buf[0], 0xef);
    const fr = buf.toString('utf8');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /widgetGuid/);
    assert.match(fr, /RFC 4122|randomUUID|v4/i);
    assert.match(fr, /migrate-uri-to-guid/);
    assert.match(fr, /Supersedes:\*\*\s*FR-211/);
    const fr211 = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-211.md'), 'utf8');
    assert.match(fr211, /[Ss]uperseded|FR-232/);
  });

  it('createWidget uses default Customers store; mint lowercase GUID', () => {
    const src = fs.readFileSync(
      path.join(root, 'shared', 'widgets', 'createWidget.js'),
      'utf8',
    );
    assert.match(src, /getDefaultCustomersStore/);
    assert.match(src, /function createWidget/);
    assert.match(src, /toLowerCase/);
    assert.doesNotMatch(src, /^<<<<<<<|^=======|^>>>>>>>/m);
    const cust = fs.readFileSync(
      path.join(root, 'shared', 'components', 'customers.js'),
      'utf8',
    );
    assert.match(cust, /getDefaultCustomersStore/);
    assert.match(cust, /setDefaultCustomersStore/);
    assert.match(cust, /bindWidget/);
    assert.match(cust, /randomUUID\(\)\.toLowerCase\(\)/);
  });

  it('entry routes share default store; migrate script dry-run default', () => {
    for (const rel of [
      'entry/src/widgetsCreate.js',
      'entry/src/parts.js',
      'entry/src/go.js',
      'entry/src/extStatus.js',
    ]) {
      const t = fs.readFileSync(path.join(root, rel), 'utf8');
      assert.match(t, /getDefaultCustomersStore/, rel);
    }
    const mig = fs.readFileSync(
      path.join(root, 'scripts', 'migrate-uri-to-guid.js'),
      'utf8',
    );
    assert.match(mig, /dry-run|dryRun/i);
    assert.match(mig, /--apply/);
    assert.match(mig, /v5|uuid/i);
  });

  it('acceptance test file present', () => {
    assert.ok(
      fs.existsSync(
        path.join(root, 'tests', 'components-piece-widget-guid.test.js'),
      ),
    );
  });
});
