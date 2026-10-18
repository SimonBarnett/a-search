'use strict';

/**
 * MRB #4156 hostile: awin-agent Merc paste must not ship BEL (U+0007)
 * corruption where ASCII "a" belongs (seen in AGENTS.md / README / skills).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const agentRoot = path.join(__dirname, '..', 'redqueen', 'awin-agent');

function walkMd(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkMd(p, out);
    else if (ent.name.endsWith('.md')) out.push(p);
  }
  return out;
}

describe('MRB #4156 hostile awin-agent Merc paste encoding', () => {
  it('no BEL (0x07) control chars in redqueen/awin-agent markdown', () => {
    const files = walkMd(agentRoot);
    assert.ok(files.length >= 10, 'expected AGENTS/README + skills');
    for (const f of files) {
      const raw = fs.readFileSync(f);
      assert.equal(
        raw.includes(0x07),
        false,
        `${path.relative(agentRoot, f)} must not contain BEL (use ASCII a)`,
      );
      assert.notEqual(raw[0], 0xef, `${f} UTF-8 no BOM`);
    }
  });

  it('AGENTS.md still names a-affiliates/AGENTS.md then awin/AGENT.md', () => {
    const t = fs.readFileSync(path.join(agentRoot, 'AGENTS.md'), 'utf8');
    assert.match(t, /a-affiliates\/AGENTS\.md/);
    assert.match(t, /awin\/AGENT\.md/);
    assert.match(t, /a-search-awin-agent-\*/);
    assert.doesNotMatch(t, /PENDING from Merc/);
  });
});
