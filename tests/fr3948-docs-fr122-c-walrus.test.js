'use strict';

/**
 * FR-3948 / #3948: docs lock FR-122 C, walrus host, a-clubs/{host}/{guid}/IN/.
 * Docs-only child of umbrella #3944 / Plan #3946.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function utf8NoBom(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.equal(
    buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
    false,
    `${rel} must be UTF-8 without BOM`,
  );
  return buf.toString('utf8');
}

describe('FR-3948 docs lock FR-122 C / walrus / a-clubs IN', () => {
  it('environments.md: walrus, LOCKED C, a-clubs IN path, no Chosen PENDING', () => {
    const text = utf8NoBom('docs/environments.md');
    assert.match(text, /## Network path \(FR-122\)/);
    assert.match(text, /Chosen option[\s:*]*\*\*LOCKED C\*\*/);
    assert.match(text, /walrus/i);
    assert.match(text, /a-clubs\/\{host\}\/\{guid\}\/IN\//);
    assert.doesNotMatch(text, /Chosen option[\s:*]*\*\*PENDING\*\*/);
    assert.match(text, /no inbound ports/i);
    assert.match(text, /FR-3948/);
  });

  it('deploy.md + secrets-matrix: new stack omits mssqlSecretArn; live a_search not madeiradb', () => {
    const deploy = utf8NoBom('docs/deploy.md');
    assert.match(deploy, /FR-3948/);
    assert.match(deploy, /LOCKED C/);
    assert.match(deploy, /do \*\*not\*\* pass `-c mssqlSecretArn`|Omit for the new stack|omit for new stack/i);
    assert.match(deploy, /walrus/i);

    const sm = utf8NoBom('docs/secrets-matrix.md');
    assert.match(sm, /FR-3948/);
    assert.match(sm, /live \*\*`a_search`\*\*|live \*\*a_search\*\*|live `a_search`/i);
    assert.doesNotMatch(sm, /\| `MSSQL_DATABASE` \| live `madeiradb`/);
    assert.match(sm, /Never live `madeiradb`|never `madeiradb` for writers/i);
    assert.match(sm, /Omit for the\s+new stack|do \*\*not\*\* pass `-c mssqlSecretArn`/i);
  });

  it('rclone-results.md: walrus writes; a-clubs IN; no HOSTS/ prefix', () => {
    const text = utf8NoBom('docs/rclone-results.md');
    assert.match(text, /walrus/i);
    assert.match(text, /FR-3948/);
    assert.match(text, /a-clubs\/\{host\}\/\{guid\}\/IN\//);
    assert.match(text, /no\*\*\s*`HOSTS\/`|no\s*`HOSTS\/`|\*\*no\*\*\s*`HOSTS\/`/i);
    assert.match(text, /writes/i);
  });

  it('vision.md Chosen option LOCKED C', () => {
    const text = utf8NoBom('docs/vision.md');
    assert.match(text, /FR-122/);
    assert.match(text, /LOCKED C/);
    assert.match(text, /walrus/i);
    assert.match(text, /a-clubs\/\{host\}\/\{guid\}\/IN\//);
    assert.doesNotMatch(text, /choice still PENDING/i);
  });
});
