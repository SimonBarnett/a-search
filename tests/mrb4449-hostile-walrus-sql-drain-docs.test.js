/** docs/mrb-4449: pin FR #4448 walrus SQL drain docs (hostile). */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..');

describe('docs/mrb-4449 walrus SQL drain (FR #4448)', () => {
  it('search-fanout pins walrus drain, no Lambda->MSSQL, madeiradb SELECT-only', () => {
    const doc = fs.readFileSync(path.join(ROOT, 'docs', 'search-fanout.md'), 'utf8');
    assert.equal(doc.charCodeAt(0) === 0xfeff, false);
    assert.match(doc, /## SQL SQS: drained on walrus/);
    assert.match(doc, /No AWS Lambda connects to MSSQL/);
    assert.match(doc, /madeiradb stays SELECT-only/);
    assert.match(doc, /\| Walrus SQL drain \|/);
    assert.doesNotMatch(doc, /## SQL SQS: drained on redqueen/);
    assert.doesNotMatch(doc, /redqueen\/sql-search-drain/);
    assert.doesNotMatch(doc, /\| Redqueen SQL drain \|/);
  });

  it('deploy.md points Walrus SQL drain IAM / TBD until #4447', () => {
    const doc = fs.readFileSync(path.join(ROOT, 'docs', 'deploy.md'), 'utf8');
    assert.match(doc, /Walrus SQL drain IAM/);
    assert.match(doc, /#4447/);
  });
});
