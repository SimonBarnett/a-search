'use strict';

/**
 * MRB #670 hostile: Phase-2 FR backlog docs (FR-061..112) stay-dark + no BOM.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function readNoBom(rel) {
  const p = path.join(root, rel);
  const buf = fs.readFileSync(p);
  assert.equal(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, false, rel);
  assert.equal(buf[buf.length - 1], 0x0a, `trailing newline ${rel}`);
  return buf.toString('utf8');
}

describe('MRB #670 hostile Phase-2 FR backlog', () => {
  it('ISSUED-PHASE2 maps FR-061..112 to issues #614-#665', () => {
    const text = readNoBom('docs/fr/ISSUED-PHASE2.md');
    assert.match(text, /FR-061/);
    assert.match(text, /#614/);
    assert.match(text, /FR-112/);
    assert.match(text, /#665/);
    assert.match(text, /Stay-dark|enabled stays false/i);
  });

  it('feature-request Success rows include stay-dark P2-S4', () => {
    const text = readNoBom(
      'docs/feature-request-phase2-all-providers-2026-10-08.md',
    );
    assert.match(text, /P2-S4/);
    assert.match(text, /enabled\.live===false|enabled\.live.*false/i);
    assert.match(text, /stay.?dark/i);
  });

  it('sample FR drafts have Goal/Deliverables/Testable + stay-dark', () => {
    for (const code of ['FR-062', 'FR-063', 'FR-083', 'FR-112']) {
      const text = readNoBom(`docs/fr/${code}.md`);
      assert.match(text, /## Goal/);
      assert.match(text, /## Deliverables/);
      assert.match(text, /## Testable/);
      assert.match(text, /enabled\.live=false/);
      assert.match(text, /One PR closes this issue only/);
    }
  });

  it('README links phase2 feature-request and ISSUED index', () => {
    const readme = readNoBom('README.md');
    assert.match(readme, /feature-request-phase2-all-providers-2026-10-08\.md/);
    assert.match(readme, /docs\/fr\/ISSUED-PHASE2\.md/);
  });

  it('phase2 FR-061..112 markdown files have no UTF-8 BOM', () => {
    const dir = path.join(root, 'docs', 'fr');
    let n = 0;
    for (const name of fs.readdirSync(dir)) {
      if (!/^FR-(0(6[1-9]|[7-9]\d)|1[0-1]\d)\.md$/.test(name)) continue;
      readNoBom(path.join('docs', 'fr', name));
      n += 1;
    }
    assert.equal(n, 52);
  });
});
