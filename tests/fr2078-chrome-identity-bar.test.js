'use strict';

/**
 * #2078: chrome.identity login + logged-in top bar + Edit dialog pins.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  buildExtensionLoginUrl,
  parseJwtFromRedirectUrl,
  decodeJwtPayload,
  isClubRole,
  isAllowedExtensionRedirectUri,
} = require('../shared/extension/webAuthFlow');
const {
  formatCommissionChip,
  buildBarActions,
} = require('../shared/extension/barModel');
const { findJwtStorageViolations } = require('../shared/extension/jwtPolicy');

const FIXTURE_HS256_KEY = Buffer.alloc(32, 0x42).toString('hex');

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signHs256(payload, key = FIXTURE_HS256_KEY) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = crypto.createHmac('sha256', key).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

function utf8NoBom(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  assert.notEqual(buf[0], 0xef, `${rel} must be UTF-8 without BOM`);
  return buf.toString('utf8');
}

describe('FR-2078 chrome identity + logged-in bar', () => {
  it('webAuthFlow: build login URL, parse redirect JWT, club role gate', () => {
    const url = buildExtensionLoginUrl({
      loginOrigin: 'https://www.smartcatalogue.uk',
      redirectUri: 'https://abcdefghijklmnopqrstuvwxyzabcdef.chromiumapp.org/',
      intent: 'club',
    });
    assert.match(url, /extension=1/);
    assert.match(url, /intent=club/);
    assert.match(url, /redirect_uri=/);
    assert.match(url, /components-piece\/login/);

    const jwt = signHs256({
      userId: 'CLUB0001',
      role: 'club',
      iss: 'https://issuer.example',
      aud: 'a-search',
    });
    const parsed = parseJwtFromRedirectUrl(
      'https://ext.chromiumapp.org/#access_token=' +
        encodeURIComponent(jwt) +
        '&token_type=Bearer',
    );
    assert.equal(parsed, jwt);
    const payload = decodeJwtPayload(jwt);
    assert.equal(payload.role, 'club');
    assert.equal(isClubRole(payload), true);
    assert.equal(isClubRole({ role: 'partner' }), false);
    assert.equal(parseJwtFromRedirectUrl('https://ext.chromiumapp.org/'), null);
    assert.equal(
      isAllowedExtensionRedirectUri(
        'https://abcdefghijklmnopqrstuvwxyzabcdef.chromiumapp.org/',
      ),
      true,
    );
    assert.equal(isAllowedExtensionRedirectUri('chrome-extension://abc/cb'), true);
    assert.equal(isAllowedExtensionRedirectUri('https://evil.example/steal'), false);
    assert.equal(isAllowedExtensionRedirectUri('http://x.chromiumapp.org/'), false);
  });

  it('barModel: logged-out login only; club gets Claim; commission chip format', () => {
    assert.deepEqual(buildBarActions({ loggedIn: false }).map((a) => a.action), [
      'login',
    ]);
    const club = buildBarActions({
      loggedIn: true,
      role: 'club',
      commission: { unclaimedMinor: 1234, currency: 'GBP' },
    });
    assert.ok(club.some((a) => a.action === 'claim'));
    assert.ok(club.some((a) => a.action === 'stripe'));
    assert.ok(club.some((a) => a.action === 'upgrade'));
    assert.ok(club.some((a) => a.action === 'create'));
    assert.equal(formatCommissionChip({ unclaimedMinor: 1234, currency: 'GBP' }), 'GBP 12.34');

    const partner = buildBarActions({ loggedIn: true, role: 'partner' });
    assert.ok(!partner.some((a) => a.action === 'claim'));
  });

  it('extension sources: launchWebAuthFlow, bar actions, edit dialog, no JWT sinks', () => {
    const bg = utf8NoBom('extension/background.js');
    const content = utf8NoBom('extension/content.js');
    const manifest = JSON.parse(utf8NoBom('extension/manifest.json'));

    assert.equal(findJwtStorageViolations(bg).length, 0);
    assert.equal(findJwtStorageViolations(content).length, 0);
    assert.match(bg, /launchWebAuthFlow/);
    assert.match(bg, /getRedirectURL/);
    assert.match(bg, /fixtureJwt/);
    assert.match(bg, /\/account\/commission/);
    assert.match(bg, /\/account\/stripe\/link/);
    assert.match(bg, /\/account\/payouts/);
    assert.match(bg, /\/account\/upgrade/);
    assert.match(bg, /createdVia:\s*'extension'|createdVia: \"extension\"/);
    assert.match(content, /data-action=\"claim\"|data-action='claim'|Claim/);
    assert.match(content, /data-action=\"create\"|Create widget/);
    assert.match(content, /data-action=\"upgrade\"|Upgrade/);
    assert.match(content, /data-action=\"stripe\"|Stripe/);
    assert.match(content, /data-role=\"edit-dialog\"/);
    assert.match(content, /patchWidget|widgetFeedback/);
    assert.match(content, /clipboard\.writeText|copyText/);
    assert.ok(manifest.permissions.includes('identity'));
    assert.ok(manifest.permissions.includes('clipboardWrite'));
  });

  it('docs Decision LOCKED + login page extension bridge note', () => {
    const fr = utf8NoBom('docs/fr/FR-2078.md');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /launchWebAuthFlow/);
    assert.match(fr, /Claim/);
    assert.match(fr, /clipboard/i);

    const login = utf8NoBom('components-piece/login/index.html');
    assert.match(login, /params\.get\(['\"]extension['\"]\)/);
    assert.match(login, /access_token/);
    assert.match(login, /A_SEARCH_EXT_FIXTURE_JWT/);
    assert.match(login, /redirect_uri/);
    // Source uses a RegExp literal: /\.chromiumapp\.org$/i
    assert.match(login, /chromiumapp\\\.org/);
    assert.match(login, /isAllowedExtensionRedirectUri|chrome-extension:/);
    const bgSrc = utf8NoBom('extension/background.js');
    assert.match(bgSrc, /forbidden_not_club|role !== 'club'/);

    const fr1344 = utf8NoBom('docs/fr/FR-1344.md');
    assert.match(fr1344, /FR-2078|#2078/);
  });
});
