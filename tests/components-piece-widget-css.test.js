'use strict';

/**
 * FR-202 / #1190: widget CSS is layout-only; host owns theme.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CSS_PATH = path.join(ROOT, 'widget', 'a-search-widget.css');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-202.md');
const MOCK_DIR = path.join(ROOT, 'docs', 'mocks', 'components-piece');
const MOCK_FILES = ['home.html', 'empty.html', 'error.html'];

/** Strip /* ... *\/ and // comments (naive; enough for our layout sheet). */
function stripComments(css) {
  return String(css)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Banned theme declarations in widget CSS.
 * Allow inherit / currentColor / transparent / none only.
 */
const ALLOWED_THEME_VALUE = /^(inherit|currentcolor|transparent|none)\s*!important\s*$|^(inherit|currentcolor|transparent|none)\s*$/i;

/**
 * Find property declarations whose name matches propRe and value fails allowlist.
 * @param {string} css
 * @param {RegExp} propRe e.g. /^color$/i or /^background(-color)?$/i
 */
function findBannedProps(css, propRe) {
  const hits = [];
  const declRe = /(^|[{;])\s*([a-z-]+)\s*:\s*([^;}]*)/gi;
  let m;
  while ((m = declRe.exec(css))) {
    const prop = m[2];
    const val = String(m[3] || '').trim();
    if (!propRe.test(prop)) continue;
    if (ALLOWED_THEME_VALUE.test(val)) continue;
    hits.push(prop + ': ' + val.slice(0, 60));
  }
  return hits;
}

function assertAsciiNoBom(buf, label) {
  assert.ok(buf.length === 0 || buf[0] !== 0xef, label + ': unexpected UTF-8 BOM');
  for (let i = 0; i < buf.length; i++) {
    assert.ok(buf[i] < 128, label + ': non-ASCII byte at ' + i + ' (0x' + buf[i].toString(16) + ')');
  }
}

describe('FR-202 widget layout CSS (no competing theme)', () => {
  it('ships widget/a-search-widget.css', () => {
    assert.ok(fs.existsSync(CSS_PATH), 'missing ' + CSS_PATH);
  });

  it('CSS is UTF-8 no-BOM ASCII', () => {
    const buf = fs.readFileSync(CSS_PATH);
    assertAsciiNoBom(buf, 'a-search-widget.css');
  });

  it('CSS forbids theme color/font/background rules', () => {
    const raw = fs.readFileSync(CSS_PATH, 'utf8');
    const css = stripComments(raw);
    const hits = []
      .concat(findBannedProps(css, /^color$/i))
      .concat(findBannedProps(css, /^font-family$/i))
      .concat(findBannedProps(css, /^background(-color)?$/i))
      .concat(findBannedProps(css, /^background-image$/i));
    assert.deepEqual(hits, [], 'banned theme props in widget CSS: ' + hits.join(' | '));
  });

  it('CSS covers horizontal vertical fullscreen layout hooks', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    assert.match(css, /\.a-search-widget\[data-mode=["']horizontal["']\]/);
    assert.match(css, /\.a-search-widget\[data-mode=["']vertical["']\]/);
    assert.match(css, /\.a-search-widget\[data-mode=["']fullscreen["']\]/);
    assert.match(css, /display\s*:\s*flex/i);
    assert.match(css, /\.a-search-widget\s+\.part\b/);
    assert.match(css, /font\s*:\s*inherit/i);
    assert.match(css, /currentColor/i);
  });

  it('docs/fr/FR-202.md Decision LOCKED ASCII', () => {
    const buf = fs.readFileSync(FR_DOC);
    assertAsciiNoBom(buf, 'FR-202.md');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /layout-only|layout only/i);
    assert.match(text, /a-search-widget\.css/);
  });

  it('components-piece mocks stay host-themed and link layout CSS', () => {
    for (const name of MOCK_FILES) {
      const p = path.join(MOCK_DIR, name);
      assert.ok(fs.existsSync(p), 'missing mock ' + name);
      const html = fs.readFileSync(p, 'utf8');
      assert.match(
        html,
        /a-search-widget\.css/,
        name + ' must link widget/a-search-widget.css',
      );
      // Host owns theme: body or .host-nav still set color/font/background.
      assert.match(
        html,
        /(body|\.host-nav)[^{]*\{[^}]*(color|font-family|background)\s*:/i,
        name + ' must keep host theme rules',
      );
      // Inline <style> must not reintroduce banned widget theme props under .a-search-widget.
      const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(
        (m) => m[1],
      );
      const joined = styleBlocks.join('\n');
      // Extract rough .a-search-widget rule bodies from inline style only.
      const widgetChunks = [];
      const re = /\.a-search-widget[^{]*\{([^}]*)\}/g;
      let m;
      while ((m = re.exec(joined))) widgetChunks.push(m[1]);
      const widgetInline = '{' + widgetChunks.join(';') + '}';
      const hits = []
        .concat(findBannedProps(widgetInline, /^color$/i))
        .concat(findBannedProps(widgetInline, /^font-family$/i))
        .concat(findBannedProps(widgetInline, /^background(-color)?$/i))
        .concat(findBannedProps(widgetInline, /^background-image$/i));
      assert.deepEqual(
        hits,
        [],
        name + ' inline .a-search-widget banned theme: ' + hits.join(' | '),
      );
    }
  });
});
