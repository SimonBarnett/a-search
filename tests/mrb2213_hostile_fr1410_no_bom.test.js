'use strict';

/**
 * MRB #2213 hostile pins for FR-1410 docs/mrb no-BOM gate.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const MRB = path.join(ROOT, 'docs', 'mrb');
const GATE = path.join(ROOT, 'tests', 'fr1410-docs-mrb-no-bom.test.js');

describe('MRB #2213 hostile FR-1410 docs/mrb no BOM', () => {
  it('gate test scans every docs/mrb/*.md for EF BB BF', () => {
    const text = fs.readFileSync(GATE, 'utf8');
    assert.match(text, /docs[\\/]mrb/);
    assert.match(text, /0xef|\\xef|EF BB BF|utf-8 bom/i);
    assert.match(text, /readdirSync/);
  });

  it('named tips from #2213 are BOM-free; planted BOM is detectable', () => {
    for (const name of [
      'mrb-1180.md',
      'mrb-1327.md',
      'mrb-1386.md',
      'mrb-1388.md',
    ]) {
      const buf = fs.readFileSync(path.join(MRB, name));
      assert.ok(
        !(buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf),
        `${name} still has BOM`,
      );
    }
    const tmp = path.join(os.tmpdir(), `mrb2213-bom-${process.pid}.md`);
    fs.writeFileSync(tmp, Buffer.from([0xef, 0xbb, 0xbf, 0x23, 0x20])); // BOM + "# "
    const planted = fs.readFileSync(tmp);
    assert.ok(
      planted[0] === 0xef && planted[1] === 0xbb && planted[2] === 0xbf,
      'fixture must start with BOM',
    );
    fs.unlinkSync(tmp);
  });
});
