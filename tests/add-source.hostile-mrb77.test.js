'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB #77 hostile: FR-025 add-source docs', () => {
  it('checklist pins S3: folder+registry+queue; no entry/ rewrite', () => {
    const text = fs.readFileSync(path.join(root, 'docs', 'add-source.md'), 'utf8');
    assert.match(text, /registry/i);
    assert.match(text, /enabled/);
    assert.match(text, /queueName|a-search-\{id\}/i);
    assert.match(text, /Do not edit `entry\/` core|without editing `entry\/`/i);
    assert.match(text, /vision\.md.*S3|Vision gate \*\*S3\*\*/i);
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/add-source\.md/);
  });
});