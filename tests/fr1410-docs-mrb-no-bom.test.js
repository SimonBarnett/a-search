'use strict';

/**
 * FR-1410: every docs/mrb/*.md must be UTF-8 without BOM.
 * WinPS Set-Content -Encoding utf8 prepends EF BB BF; CI previously only
 * gated SKILL.md, so BOMs landed on docs/mrb tips unnoticed.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mrbDir = path.join(root, 'docs', 'mrb');

describe('FR-1410 docs/mrb UTF-8 no BOM', () => {
  it('docs/mrb directory exists', () => {
    assert.ok(fs.existsSync(mrbDir), 'docs/mrb missing');
  });

  it('every docs/mrb/*.md starts without UTF-8 BOM', () => {
    const files = fs
      .readdirSync(mrbDir)
      .filter((f) => f.endsWith('.md'))
      .sort();
    assert.ok(files.length > 0, 'expected at least one docs/mrb/*.md');
    const withBom = [];
    for (const f of files) {
      const buf = fs.readFileSync(path.join(mrbDir, f));
      if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
        withBom.push(f);
      }
    }
    assert.deepEqual(
      withBom,
      [],
      `UTF-8 BOM found in docs/mrb: ${withBom.join(', ')} (write via Path.write_text encoding=utf-8 or UTF8Encoding(false))`,
    );
  });
});
