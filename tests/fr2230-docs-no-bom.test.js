'use strict';

/**
 * FR-2230: every markdown file under docs/ (recursive) must be UTF-8 without BOM.
 * FR-1410 gated docs/mrb/ only; inventory still found BOM on docs/*.md
 * (endpoint-search.md, docs/mrb-*.md at docs/ root, etc.).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const docsDir = path.join(root, 'docs');

function listMarkdownFiles(dir, relBase = '') {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listMarkdownFiles(abs, rel));
    } else if (ent.isFile() && ent.name.endsWith('.md')) {
      out.push(rel.replace(/\\/g, '/'));
    }
  }
  return out.sort();
}

function hasUtf8Bom(buf) {
  return (
    buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
  );
}

describe('FR-2230 docs recursive markdown UTF-8 no BOM', () => {
  it('docs directory exists', () => {
    assert.ok(fs.existsSync(docsDir), 'docs missing');
  });

  it('every docs markdown file starts without UTF-8 BOM', () => {
    const files = listMarkdownFiles(docsDir);
    assert.ok(files.length > 0, 'expected at least one docs markdown file');
    const withBom = [];
    for (const rel of files) {
      const buf = fs.readFileSync(path.join(docsDir, rel));
      if (hasUtf8Bom(buf)) withBom.push(rel);
    }
    assert.deepEqual(
      withBom,
      [],
      `UTF-8 BOM found in docs/: ${withBom.join(', ')} (write via Path.write_text encoding=utf-8 or UTF8Encoding(false))`,
    );
  });

  it('covers docs root tips outside docs/mrb (FR-2230 scope)', () => {
    const gate = fs.readFileSync(__filename, 'utf8');
    assert.match(gate, /listMarkdownFiles/);
    assert.match(gate, /0xef|EF BB BF|utf-8 bom/i);
    const files = listMarkdownFiles(docsDir);
    assert.ok(
      files.some((f) => f === 'endpoint-search.md' || !f.includes('/')),
      'expected at least one docs/*.md at docs root in inventory',
    );
  });
});
