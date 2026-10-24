'use strict';

/**
 * MRB #4867 hostile: FR #4854-#4856 probes skip MSSQL config unless connect
 * is injected.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

const FILES = [
  'providers/local/awin/src/selftestProbe.js',
  'providers/local/impact/src/selftestProbe.js',
  'providers/local/partnerize/src/selftestProbe.js',
  'providers/local/shopify/src/selftestProbe.js',
];

describe('MRB #4867 hostile MSSQL fixture gate', () => {
  it('every listed probe returns ok when !liveSql before mssqlConfigFromEnv', () => {
    for (const rel of FILES) {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      assert.match(text, /liveSql/, rel);
      const liveAt = text.indexOf('if (!liveSql)');
      const cfgAt = text.indexOf('mssqlConfigFromEnv');
      assert.ok(liveAt >= 0 && cfgAt > liveAt, rel + ' config before liveSql skip');
    }
  });

  it('docs name FR #4854-#4856 and live connect path', () => {
    const doc = fs.readFileSync(
      path.join(root, 'docs', 'endpoint-selftest.md'),
      'utf8',
    );
    assert.match(doc, /FR #4854/);
    assert.match(doc, /mssql_missing_config/);
    assert.match(doc, /connect/);
  });
});
