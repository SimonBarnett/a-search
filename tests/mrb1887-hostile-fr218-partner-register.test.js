'use strict';

/**
 * MRB #1887 docs/hostile: FR-218 partner register DNS code.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  mintPartnerCode,
  buildPartnerRegisterResponse,
  INSTRUCTIONS_URL,
  USER_ID_RE,
} = require('../shared/partners/register');

describe('MRB #1887 hostile FR-218 partner register', () => {
  it('Decision LOCKED; 8-char code; instructions; partners packed; CDK+entry wired', async () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-218.md'), 'utf8');
    assert.match(fr, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(fr, /POST \/partner\/register/);
    assert.match(fr, /smartcatalogue\.uk\/partners/);

    const code = await mintPartnerCode({ mint: () => 'ABCD1234' });
    assert.match(code, USER_ID_RE);
    const resp = buildPartnerRegisterResponse({ partnerCode: code });
    assert.equal(resp.instructionsUrl, INSTRUCTIONS_URL);
    assert.match(resp.instructions, /Chrome extension|\/ext\/status/i);
    assert.match(resp.instructions, /Partner TXT/i);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(pkg.files.includes('partners/'));

    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /path:\s*'\/partner\/register'/);
    const index = fs.readFileSync(
      path.join(ROOT, 'entry', 'src', 'index.js'),
      'utf8',
    );
    assert.match(index, /handlePartnerRegister/);
    assert.match(index, /handleWidgetsCreate/);
    assert.ok(
      fs.existsSync(
        path.join(ROOT, 'components-piece', 'partner-register', 'index.html'),
      ),
    );
  });
});
