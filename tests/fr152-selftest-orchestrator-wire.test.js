'use strict';

/**
 * FR-152: entry /selftest uses orchestrator + enabled probes (non-empty providers).
 * Disabled registry sources are skipped; staging ships selftestProbe.js for enabled ids.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { handler, handleSelftest } = require('../entry/src/index');
const {
  stageEntryLambdaAsset,
  requiredEntryAssetPaths,
} = require('../scripts/stage-entry-lambda-asset');
const { enabled, loadRegistry } = require('../providers/loadRegistry');

const root = path.join(__dirname, '..');

const FIXTURE_HS256_KEY = Buffer.alloc(32, 0x42).toString('hex');
const ISSUER = 'https://login.test.invalid/';
const AUDIENCE = 'a-search';

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

function validToken(userId = 'ABC12345') {
  return signHs256({
    userId,
    iss: ISSUER,
    aud: AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

const jwtEnv = {
  JWT_ISSUER: ISSUER,
  JWT_AUDIENCE: AUDIENCE,
  JWT_SECRET: FIXTURE_HS256_KEY,
};

function selftestEvent({ method = 'GET', auth, body, query } = {}) {
  return {
    httpMethod: method,
    path: '/selftest',
    rawPath: '/selftest',
    headers: auth ? { authorization: auth } : {},
    queryStringParameters: query || null,
    body: body != null ? JSON.stringify(body) : undefined,
  };
}

describe('FR-152 selftest orchestrator wire', () => {
  it('fixture probes yield non-empty providers; disabled sources skipped', async () => {
    const probed = [];
    const listEnabled = (env) => {
      assert.equal(env, 'live');
      return ['amazon', 'ebay'];
    };
    const probe = async (source) => {
      probed.push(source);
      return {
        ok: source === 'amazon',
        source,
        latencyMs: 3,
        ...(source === 'ebay' ? { error: 'browse_api_unreachable' } : {}),
      };
    };

    const res = await handler(
      selftestEvent({
        method: 'GET',
        auth: `Bearer ${validToken('JWTUSER1')}`,
      }),
      {},
      {
        env: jwtEnv,
        listEnabled,
        probe,
        reportSelftestFailures: async () => ({ intakeFiled: [] }),
      },
    );

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.ok, true);
    assert.equal(json.userId, 'JWTUSER1');
    assert.equal(json.env, 'live');
    assert.ok(Array.isArray(json.providers));
    assert.ok(json.providers.length >= 1, 'providers must be non-empty');
    assert.equal(json.providers.length, 2);
    assert.deepEqual(
      json.providers.map((p) => p.id),
      ['amazon', 'ebay'],
    );
    assert.equal(json.providers[0].ok, true);
    assert.equal(json.providers[1].ok, false);
    assert.equal(json.providers[1].error, 'browse_api_unreachable');
    assert.deepEqual(json.failed, ['ebay']);
    assert.ok(Array.isArray(json.intakeFiled));
    assert.deepEqual(probed, ['amazon', 'ebay']);
    assert.ok(!probed.includes('kelkoo'));
  });

  it('optional sources intersects enabled only (disabled omitted)', async () => {
    const probed = [];
    const res = await handleSelftest(
      selftestEvent({
        method: 'POST',
        auth: `Bearer ${validToken('USER0001')}`,
        body: { sources: ['ebay', 'kelkoo'], sandbox: false },
      }),
      {
        env: jwtEnv,
        listEnabled: () => ['amazon', 'ebay', 'awin'],
        probe: async (source) => {
          probed.push(source);
          return { ok: true, source, latencyMs: 1 };
        },
        reportSelftestFailures: async () => ({ intakeFiled: [] }),
      },
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.deepEqual(probed, ['ebay']);
    assert.equal(json.providers.length, 1);
    assert.equal(json.providers[0].id, 'ebay');
    assert.ok(!json.providers.some((p) => p.id === 'kelkoo'));
  });

  it('real registry listEnabled skips stay-dark kijiji', async () => {
    const live = enabled('live');
    assert.ok(live.includes('amazon'));
    assert.ok(!live.includes('kelkoo'));

    const probed = [];
    const res = await handleSelftest(
      selftestEvent({
        method: 'GET',
        auth: `Bearer ${validToken('REGUSER1')}`,
      }),
      {
        env: jwtEnv,
        listEnabled: enabled,
        probe: async (source) => {
          probed.push(source);
          return { ok: true, source, latencyMs: 0 };
        },
        reportSelftestFailures: async () => ({ intakeFiled: [] }),
      },
    );
    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.body);
    assert.ok(json.providers.length > 0);
    assert.deepEqual(
      json.providers.map((p) => p.id).sort(),
      [...live].sort(),
    );
    assert.ok(!probed.includes('kelkoo'));
  });

  it('staged entry asset includes enabled source selftestProbe.js', () => {
    const outDir = stageEntryLambdaAsset(root);
    for (const rel of requiredEntryAssetPaths()) {
      assert.ok(
        fs.existsSync(path.join(outDir, rel)),
        `missing staged path ${rel}`,
      );
    }
    const { sources } = loadRegistry();
    const enabledAny = sources.filter(
      (s) =>
        s &&
        s.enabled &&
        (s.enabled.live === true || s.enabled.sandbox === true),
    );
    assert.ok(enabledAny.length >= 1);
    for (const src of enabledAny) {
      const probeRel = path
        .join(src.folder, 'src', 'selftestProbe.js')
        .replace(/\\/g, '/');
      assert.ok(
        fs.existsSync(path.join(outDir, ...probeRel.split('/'))),
        `missing staged probe ${probeRel}`,
      );
    }
    const kelkooProbe = path.join(
      outDir,
      'providers',
      'live',
      'kelkoo',
      'src',
      'selftestProbe.js',
    );
    assert.ok(
      !fs.existsSync(kelkooProbe),
      'stay-dark kijiji probe must not be staged into entry asset',
    );

    const marker = JSON.parse(
      fs.readFileSync(
        path.join(outDir, '.a-search-entry-asset.json'),
        'utf8',
      ),
    );
    assert.equal(marker.fr152, true);
    assert.ok(Array.isArray(marker.selftestProbes));
    assert.ok(marker.selftestProbes.includes('amazon'));
    assert.ok(!marker.selftestProbes.includes('kelkoo'));
  });

  it('FR-152 docs Decision LOCKED and gap pass2 row marked Yes', () => {
    const fr = fs.readFileSync(
      path.join(root, 'docs', 'fr', 'FR-152.md'),
      'utf8',
    );
    assert.match(fr, /Decision:\s*LOCKED/i);
    assert.match(fr, /orchestrator|selftestProbe/i);
    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md'),
      'utf8',
    );
    assert.match(
      gap,
      /\/selftest still empty providers\[[^\n]*\*\*Yes\*\*[^\n]*FR-152/i,
    );
  });
});
