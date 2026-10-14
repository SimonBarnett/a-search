'use strict';

/**
 * FR-214 / #1219: docs lock merchant wizard, partner/club pages, Stripe rules.
 * Docs only -- no live Stripe / OAuth.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const DOC = path.join(root, 'docs', 'components-piece-merchant.md');
const ARCH = path.join(root, 'docs', 'components-piece.md');
const FR214 = path.join(root, 'docs', 'fr', 'FR-214.md');
const FR223 = path.join(root, 'docs', 'fr', 'FR-223.md');
const FEATURE = path.join(
  root,
  'docs',
  'feature-request-components-piece-2026-10-09.md',
);
const README = path.join(root, 'README.md');

function assertAscii(buf, label) {
  assert.notEqual(buf[0], 0xef, `${label}: no UTF-8 BOM`);
  const text = buf.toString('utf8');
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    assert.ok(
      c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126),
      `${label}: non-ASCII at ${i}: U+${c.toString(16)}`,
    );
  }
  return text;
}

describe('FR-214 merchant / partner / Stripe docs lock', () => {
  it('docs/components-piece-merchant.md exists ASCII-only with required headings', () => {
    assert.ok(fs.existsSync(DOC), 'missing docs/components-piece-merchant.md');
    const text = assertAscii(fs.readFileSync(DOC), 'merchant doc');
    assert.match(text, /^#\s+ComponentsPiece merchant/m);
    assert.match(text, /##\s+Source taxonomy/i);
    assert.match(text, /##\s+Merchant wizard/i);
    assert.match(text, /##\s+Stripe products/i);
    assert.match(text, /##\s+Unpaid rules/i);
    assert.match(text, /##\s+Partner \/ club widget copy pages/i);
  });

  it('pins Club/Partner DNS dual rules and copy-page hosts', () => {
    const text = fs.readFileSync(DOC, 'utf8');
    assert.match(text, /smartcatalogue\.uk/);
    assert.match(text, /clubmadeira\.uk/);
    assert.match(text, /Dual DNS TXT/i);
    assert.match(text, /Club TXT is required/i);
    assert.match(text, /Partner TXT is optional/i);
    assert.match(text, /data-widget-guid/);
    assert.match(text, /POST\s+\/widgets/);
    const arch = fs.readFileSync(ARCH, 'utf8');
    assert.match(arch, /Dual DNS TXT/i);
    assert.match(arch, /Club TXT is required/i);
  });

  it('pins merchant no-commission / no-stamping (fail-when commission required)', () => {
    const text = fs.readFileSync(DOC, 'utf8');
    assert.match(text, /No affiliate stamping/i);
    assert.match(text, /never generate commission|no affiliate tracking/i);
    assert.match(
      text,
      /Fail-when:[\s\S]*commission[\s\S]*merchant/i,
    );
    assert.match(text, /\bMERCHANT\b/);
    assert.match(text, /\bAFFILIATE\b/);
    assert.match(text, /\bPROVIDER\b/);
  });

  it('pins Stripe products merchant_shop + widget_upgrade; forbids partner_monthly', () => {
    const text = fs.readFileSync(DOC, 'utf8');
    assert.match(text, /merchant_shop/);
    assert.match(text, /widget_upgrade/);
    assert.match(text, /GBP 20/);
    assert.match(text, /GBP 10/);
    assert.match(text, /Partners are never billed/i);
    assert.match(text, /monthly partner plan \(FR-223 #1228\) is \*\*dropped\*\*/i);
    assert.match(text, /Never use\s+`partner_monthly`/);
    // Must not present partner_monthly as an active Stripe product row
    assert.doesNotMatch(text, /\|\s*[^|\n]*partner_monthly[^|\n]*\|/);
  });

  it('pins seven merchant platforms and unpaid download rules', () => {
    const text = fs.readFileSync(DOC, 'utf8');
    for (const name of [
      'Shopify',
      'Wix',
      'WooCommerce',
      'Squarespace',
      'Magento',
      'BigCommerce',
      'Ecwid',
    ]) {
      assert.match(text, new RegExp(name));
    }
    assert.match(text, /PrestaShop is \*\*dropped\*\*/);
    assert.doesNotMatch(text, /^\|\s*PrestaShop\s*\|/m);
    assert.match(text, /never\s+downloaded/i);
    assert.match(text, /2 consecutive unpaid/i);
    assert.match(text, /FR-241|#1355/);
    assert.match(text, /SMS OTP/);
    assert.match(text, /no payment at signup/i);
  });

  it('FR-214 / FR-223 stubs and cross-links', () => {
    assert.ok(fs.existsSync(FR214));
    const fr214 = assertAscii(fs.readFileSync(FR214), 'FR-214');
    assert.match(fr214, /components-piece-merchant\.md/);
    assert.match(fr214, /#1219/);
    const fr223 = assertAscii(fs.readFileSync(FR223), 'FR-223');
    assert.match(fr223, /DROPPED/);
    assert.match(fr223, /never billed/i);
    const feature = fs.readFileSync(FEATURE, 'utf8');
    assert.match(feature, /components-piece-merchant\.md/);
    assert.match(feature, /CP12:[\s\S]*per shop going live/i);
    const readme = fs.readFileSync(README, 'utf8');
    assert.match(readme, /docs\/components-piece-merchant\.md/);
  });

  it('a-search DB ownership mentioned (FR-251)', () => {
    const text = fs.readFileSync(DOC, 'utf8');
    assert.match(text, /a_search/);
    assert.match(text, /a_search_sandbox/);
    assert.match(text, /madeiradb/i);
    assert.match(text, /read-only/i);
    assert.match(text, /FR-251|#1365/);
  });
});
