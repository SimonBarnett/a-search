'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const { handler } = require('../entry/src/index');

const KEY = Buffer.alloc(32, 0x42).toString('hex');
const ISSUER = 'https://login.test.invalid/';
const AUDIENCE = 'a-search';

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function token(userId) {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(
    JSON.stringify({
      userId,
      iss: ISSUER,
      aud: AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const data = `${h}.${p}`;
  const sig = crypto.createHmac('sha256', KEY).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

describe('MRB #83 hostile: FR-027 S5/S6/S8/S9 locks', () => {
  it('npm test fails if a-search-endpoint skill missing (file present)', () => {
    const skill = path.join(
      root,
      '.grok',
      'skills',
      'a-search-endpoint',
      'SKILL.md',
    );
    assert.ok(fs.existsSync(skill));
  });

  it('body userId override of JWT → 401', async () => {
    const res = await handler(
      {
        httpMethod: 'POST',
        path: '/search',
        headers: { authorization: `Bearer ${token('JWT_USER')}` },
        body: JSON.stringify({
          q: 'x',
          catalogId: 1,
          category: 'c',
          subcategory: 's',
          userId: 'ATTACKER',
        }),
      },
      {},
      {
        env: {
          JWT_ISSUER: ISSUER,
          JWT_AUDIENCE: AUDIENCE,
          JWT_SECRET: KEY,
        },
        enqueue: async () => [],
      },
    );
    assert.equal(res.statusCode, 401);
  });

  it('auth-jwt + env-isolation-runtime + skillbook-layout suites exist', () => {
    for (const f of [
      'auth-jwt.test.js',
      'env-isolation-runtime.test.js',
      'skillbook-layout.test.js',
    ]) {
      assert.ok(fs.existsSync(path.join(root, 'tests', f)), f);
    }
  });
});