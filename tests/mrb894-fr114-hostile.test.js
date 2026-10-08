'use strict';

/**
 * MRB #894 hostile pins for FR-114 identity docs + 8-char user_id validation.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const {
  USER_ID_RE,
  isValidUserId,
  assertUserId,
  UserIdError,
} = require('../shared/identity/userId');
const {
  createMerchantUser,
  AwinUserError,
} = require('../providers/local/awin/onboarding/src/createMerchantUser');

describe('MRB-894 FR-114 hostile', () => {
  it('USER_ID_RE is exactly ^[0-9A-Z]{8}$', () => {
    assert.equal(USER_ID_RE.source, '^[0-9A-Z]{8}$');
    assert.equal(isValidUserId('ABC12345'), true);
    assert.equal(isValidUserId('usr_test'), false);
    assert.equal(isValidUserId('abc12345'), false);
    assert.throws(() => assertUserId('short'), UserIdError);
  });

  it('createMerchantUser requires newUserId and rejects usr_ mint', async () => {
    const deps = {
      findByEmail: async () => null,
      insertUser: async (row) => row,
    };
    await assert.rejects(
      () => createMerchantUser({ ...deps, email: 'a@b.invalid' }),
      (err) => err instanceof AwinUserError && err.code === 'missing_newUserId',
    );
    await assert.rejects(
      () =>
        createMerchantUser({
          ...deps,
          email: 'a@b.invalid',
          newUserId: () => 'usr_mint',
        }),
      (err) => err instanceof AwinUserError && err.code === 'invalid_user_id',
    );
    const { user } = await createMerchantUser({
      ...deps,
      email: 'ok@example.invalid',
      newUserId: () => 'HOSTILE1',
    });
    assert.equal(user.user_id, 'HOSTILE1');
  });

  it('JWT rejects non-8-char userId claim', async () => {
    const { verifyAuthorization, AuthError } = require('../entry/src/auth/jwt');
    const key = Buffer.alloc(32, 0x42).toString('hex');
    const iss = 'https://login.test.invalid/';
    const aud = 'a-search';
    function b64url(buf) {
      return Buffer.from(buf)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    }
    function sign(payload) {
      const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const p = b64url(JSON.stringify(payload));
      const data = `${h}.${p}`;
      const sig = crypto.createHmac('sha256', key).update(data).digest();
      return `${data}.${b64url(sig)}`;
    }
    const token = sign({
      userId: 'usr_jwt',
      iss,
      aud,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    await assert.rejects(
      () =>
        verifyAuthorization(`Bearer ${token}`, {
          env: { JWT_ISSUER: iss, JWT_AUDIENCE: aud, JWT_SECRET: key },
        }),
      (err) =>
        err instanceof AuthError &&
        (err.code === 'invalid_user_id_claim' || err.code === 'unauthorized'),
    );
  });

  it('identity.md covers format, open Partner question, no PII; README keep-both', () => {
    const text = fs.readFileSync(path.join(root, 'docs', 'identity.md'), 'utf8');
    assert.match(text, /\^\[0-9A-Z\]\{8\}\$/);
    assert.match(text, /GenerateUniqueUserId/);
    assert.match(text, /open question|not authoritative/i);
    assert.match(text, /clubscan/);
    assert.doesNotMatch(text, /@gmail\.com|@hotmail\.com/i);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(text));
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/identity\.md/);
    assert.match(readme, /docs\/data-model\.md/);
  });

  it('providers+entry+shared JS has no usr_ literals', () => {
    const hits = [];
    function walk(dir) {
      if (!fs.existsSync(dir)) return;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === 'node_modules') continue;
          walk(p);
        } else if (ent.isFile() && ent.name.endsWith('.js')) {
          if (fs.readFileSync(p, 'utf8').includes('usr_')) {
            hits.push(path.relative(root, p));
          }
        }
      }
    }
    for (const d of ['providers', 'entry', 'shared']) {
      walk(path.join(root, d));
    }
    assert.deepEqual(hits, []);
  });
});
