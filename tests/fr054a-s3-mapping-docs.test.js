'use strict';

/** FR-054a: docs/s3-mapping.md schema — env userId source token s3Key */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const doc = path.join(root, 'docs', 's3-mapping.md');

describe('FR-054a docs/s3-mapping.md', () => {
  it('doc lists fields env userId source token s3Key', () => {
    assert.ok(fs.existsSync(doc), 'missing docs/s3-mapping.md');
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(text, /\benv\b/);
    assert.match(text, /userId/);
    assert.match(text, /\bsource\b/);
    assert.match(text, /\btoken\b|tokenOrClickRef/);
    assert.match(text, /s3Key/);
  });

  it('doc locks store choice MSSQL or S3 _mapping and forbids memory-only', () => {
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(text, /MSSQL/i);
    assert.match(text, /_mapping/);
    assert.match(text, /memory/i);
    assert.match(text, /live|sandbox/);
  });

  it('root README links the s3-mapping doc', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/s3-mapping\.md/);
  });
});
