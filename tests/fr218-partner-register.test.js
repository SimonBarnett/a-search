'use strict';

/**
 * FR-218 / #1223: Partner registration mints DNS partner code + instructions.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-218.md');
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');
const PAGE = path.join(
  ROOT,
  'components-piece',
  'partner-register',
  'index.html',
);

const { USER_ID_RE } = require('../shared/identity/userId');
const {
  mintPartnerCode,
  buildPartnerRegisterResponse,
  INSTRUCTIONS_URL,
} = require('../shared/partners/register');
const {
  handlePartnerRegister,
  matchPartnerRegisterRoute,
} = require('../entry/src/partnerRegister');

describe('FR-218 partner registration', () => {
  it('docs/fr/FR-218.md Decision LOCKED ASCII no-BOM', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'FR-218.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /\/partner\/register/);
    assert.match(text, /smartcatalogue\.uk/);
    assert.match(text, /extension/i);
    assert.match(text, /\^\[0-9A-Z\]\{8\}\$/);
  });

  it('minted partner code matches ^[0-9A-Z]{8}$; instructions reference smartcatalogue.uk + extension', async () => {
    const fixed = await mintPartnerCode({
      mint: async () => 'AB12CD34',
    });
    assert.equal(fixed, 'AB12CD34');
    assert.match(fixed, USER_ID_RE);

    const taken = new Set(['TAKEN001']);
    const code = await mintPartnerCode({
      mint: async () => {
        // first collision then unique
        if (!mintPartnerCode._n) mintPartnerCode._n = 0;
        mintPartnerCode._n += 1;
        return mintPartnerCode._n === 1 ? 'TAKEN001' : 'OKCODE01';
      },
      isTaken: async (c) => taken.has(c),
      maxAttempts: 5,
    });
    delete mintPartnerCode._n;
    assert.equal(code, 'OKCODE01');

    const body = buildPartnerRegisterResponse({
      partnerCode: 'AB12CD34',
      email: 'partner@example.com',
    });
    assert.equal(body.partnerCode, 'AB12CD34');
    assert.match(body.partnerCode, /^[0-9A-Z]{8}$/);
    assert.match(body.instructionsUrl, /smartcatalogue\.uk/);
    assert.equal(body.instructionsUrl, INSTRUCTIONS_URL);
    assert.match(body.instructions, /smartcatalogue\.uk/i);
    assert.match(body.instructions, /extension/i);
    assert.match(body.instructions, /Partner TXT|DNS/i);
  });

  it('HTTP POST /partner/register returns code + instructions; invalid path 404 match', async () => {
    assert.equal(
      matchPartnerRegisterRoute('POST', '/partner/register'),
      'POST /partner/register',
    );
    assert.equal(matchPartnerRegisterRoute('GET', '/partner/register'), null);

    const res = await handlePartnerRegister(
      {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.co' }),
      },
      {
        mint: async () => 'ZZ99YY88',
        isTaken: async () => false,
      },
    );
    assert.equal(res.statusCode, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.ok, true);
    assert.equal(payload.partnerCode, 'ZZ99YY88');
    assert.match(payload.partnerCode, /^[0-9A-Z]{8}$/);
    assert.match(payload.instructionsUrl, /smartcatalogue\.uk/);
    assert.match(payload.instructions, /extension/i);
  });

  it('partner-register page + CDK route pins', () => {
    const html = fs.readFileSync(PAGE, 'utf8');
    assert.match(html, /partner/i);
    assert.match(html, /smartcatalogue\.uk/);
    assert.match(html, /\/partner\/register/);
    assert.match(html, /extension/i);
    for (const b of Buffer.from(html, 'utf8')) {
      assert.ok(b < 128, 'partner-register page must be ASCII');
    }

    const stack = fs.readFileSync(STACK, 'utf8');
    assert.match(stack, /path:\s*'\/partner\/register'/);
  });
});
