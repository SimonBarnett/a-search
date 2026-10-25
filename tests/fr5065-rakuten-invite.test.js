'use strict';

/**
 * FR #5065: Rakuten invite dispatch + API discovery + dry-run / cooldown / 500-char.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  trimToMax,
  craftRakutenMessage,
  uniqueRakutenMessage,
  classifyRakutenSkip,
  rankRakutenAdvertisers,
  redactSecrets,
  runRakutenInvite,
  SEED_LIVE,
  DEFAULT_MAX_MSG,
} = require('../redqueen/invite/rakutenInvite');
const { runRakutenAgent } = require('../redqueen/affiliate-agent/src/rakuten/run');

const ROOT = path.join(__dirname, '..');

function httpFixture() {
  const calls = [];
  return {
    calls,
    httpJson: async (url) => {
      calls.push(String(url));
      if (String(url).includes('/v2/advertisers')) {
        return {
          advertisers: [
            { id: '54397', name: 'Dream Home Store', categories: ['Home'] },
            { id: '54054', name: 'Etsy UK', categories: ['Craft'] },
            { id: '99901', name: 'RC Hobby Co', categories: ['Radio Control'] },
            { id: '99902', name: 'Generic Retail', categories: ['Retail'] },
          ],
        };
      }
      if (String(url).includes('/v1/partnerships')) {
        return {
          partnerships: [
            { advertiserId: '54397', status: 'live', name: 'Dream Home Store' },
            { advertiserId: '54054', status: 'pending', name: 'Etsy UK' },
          ],
        };
      }
      return {};
    },
  };
}

describe('FR #5065 invite.ps1 registry', () => {
  it('registers awin and rakuten; report path is per-provider', () => {
    const src = fs.readFileSync(path.join(ROOT, 'tools', 'invite.ps1'), 'utf8');
    assert.match(src, /InviteProviders = @\('awin', 'rakuten'\)/);
    assert.match(src, /Invoke-RakutenInvite/);
    assert.match(src, /logs\\\{0\}-invite/);
    assert.match(src, /SECRET_FILE/);
    assert.match(src, /RAKUTEN_USE_INVITE/);
  });

  it('docs name rakuten invite and no SQL feeds', () => {
    const tools = fs.readFileSync(
      path.join(ROOT, 'tools', 'README-folder-tools.md'),
      'utf8',
    );
    assert.match(tools, /rakuten/i);
    const agent = fs.readFileSync(
      path.join(
        ROOT,
        'redqueen',
        'affiliate-agent',
        'seed',
        'a-affiliates',
        'rakuten',
        'AGENT.md',
      ),
      'utf8',
    );
    assert.match(agent, /_invites/);
    assert.match(agent, /500/);
  });
});

describe('FR #5065 rakuten invite helpers', () => {
  it('500-char guard and unique messages', () => {
    const long = craftRakutenMessage({
      name: 'X'.repeat(80),
      sector: 'hobby '.repeat(80),
    });
    assert.ok(long.length <= DEFAULT_MAX_MSG);
    const used = new Set();
    const a = uniqueRakutenMessage({ id: '1', name: 'Brand' }, used);
    const b = uniqueRakutenMessage({ id: '2', name: 'Brand' }, used);
    assert.notEqual(a, b);
  });

  it('trimToMax word boundary', () => {
    assert.ok(trimToMax('word '.repeat(200), 80).length <= 80);
  });

  it('skips live seed, pending seed, approved, cooldown', () => {
    const now = new Date('2026-10-25T12:00:00Z');
    const ctx = {
      statusById: new Map([['88', 'approved']]),
      declinedAt: new Map([['77', '2026-10-20T00:00:00Z']]),
      inviteIds: new Set(['66']),
      invitedAt: new Map([['66', '2026-10-20T00:00:00Z']]),
      now,
      cooldownDays: 90,
    };
    assert.equal(classifyRakutenSkip('54397', 'Dream Home', ctx), 'live_seed');
    assert.equal(classifyRakutenSkip('54054', 'Etsy', ctx), 'pending_seed');
    assert.equal(classifyRakutenSkip('88', 'X', ctx), 'approved');
    assert.equal(classifyRakutenSkip('77', 'Y', ctx), 'cooldown_90d');
    assert.equal(classifyRakutenSkip('66', 'Z', ctx), 'cooldown_90d');
    assert.equal(classifyRakutenSkip('', 'Christow Patio', ctx), 'pending_seed');
    assert.equal(classifyRakutenSkip('99901', 'RC Hobby Co', ctx), null);
    assert.ok(SEED_LIVE.has('54397'));
  });

  it('ranks hobby/RC before generic retail', () => {
    const ranked = rankRakutenAdvertisers([
      { id: '2', name: 'Shop', categories: ['Retail'] },
      { id: '1', name: 'RC Hobby Co', categories: ['Radio Control'] },
    ]);
    assert.equal(ranked[0].id, '1');
  });

  it('redacts tokens from report text', () => {
    const out = redactSecrets('Bearer SUPERTOKENVALUE and password=SECRET', [
      'SUPERTOKENVALUE',
    ]);
    assert.doesNotMatch(out, /SUPERTOKENVALUE/);
    assert.doesNotMatch(out, /SECRET/);
  });
});

describe('FR #5065 runRakutenInvite', () => {
  it('dry-run lists ranked not-joined, no apply, no record writes', async () => {
    const fx = httpFixture();
    const writes = [];
    const out = await runRakutenInvite({
      dryRun: true,
      max: 3,
      fetchToken: async () => 'FAKE_TOKEN_NOT_REAL',
      httpJson: fx.httpJson,
      writeInviteRecord: async (row) => writes.push(row),
      apply: async () => {
        throw new Error('apply must not run on dry-run');
      },
    });
    assert.equal(out.dryRun, true);
    assert.equal(out.writes.length, 0);
    assert.equal(writes.length, 0);
    assert.ok(fx.calls.some((u) => u.includes('/v2/advertisers')));
    assert.ok(fx.calls.some((u) => u.includes('/v1/partnerships')));
    const ids = out.report.candidates.map((c) => c.id);
    assert.ok(ids.includes('99901'));
    assert.equal(ids.includes('54397'), false);
    assert.equal(ids.includes('54054'), false);
    assert.ok(ids.length <= 3);
    for (const c of out.report.candidates) {
      assert.ok(c.message.length <= 500);
    }
  });

  it('live applies at most N and records after each success', async () => {
    const fx = httpFixture();
    const writes = [];
    const out = await runRakutenInvite({
      live: true,
      dryRun: false,
      max: 1,
      fetchToken: async () => 'FAKE_TOKEN_NOT_REAL',
      httpJson: fx.httpJson,
      apply: async (c) => ({ ok: true, id: c.id }),
      writeInviteRecord: async (row) => writes.push(row),
    });
    assert.equal(out.report.counts.applied, 1);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].prefix, '_invites');
    assert.equal(writes[0].provider, 'rakuten');
  });

  it('crash after first record keeps that write', async () => {
    const fx = httpFixture();
    const writes = [];
    await assert.rejects(
      () =>
        runRakutenInvite({
          live: true,
          max: 2,
          fetchToken: async () => 'FAKE_TOKEN_NOT_REAL',
          httpJson: fx.httpJson,
          apply: async (c) => ({ ok: true, id: c.id }),
          writeInviteRecord: async (row) => writes.push(row),
          crashAfterApplications: 1,
        }),
      (err) => err.code === 'invite_crash_after_record' && err.applied.length === 1,
    );
    assert.equal(writes.length, 1);
  });

  it('captcha stops with exit 2 and no retry loop', async () => {
    const fx = httpFixture();
    let n = 0;
    await assert.rejects(
      () =>
        runRakutenInvite({
          live: true,
          max: 2,
          fetchToken: async () => 'FAKE_TOKEN_NOT_REAL',
          httpJson: fx.httpJson,
          apply: async () => {
            n += 1;
            return { ok: false, code: 'captcha' };
          },
        }),
      (err) => err.code === 'rakuten_captcha' && err.exitCode === 2,
    );
    assert.equal(n, 1);
  });

  it('scheduled agent without plan uses invite backend (no password temp)', async () => {
    const fx = httpFixture();
    const out = await runRakutenAgent({
      dryRun: true,
      affiliatesRoot: os.tmpdir(),
      providerRoot: path.join(os.tmpdir(), 'rakuten'),
      skipDocs: true,
      skipSignIn: true,
      fetchToken: async () => 'FAKE_TOKEN_NOT_REAL',
      httpJson: fx.httpJson,
    });
    assert.equal(out.ok, true);
    assert.equal(out.dryRun, true);
    assert.ok(out.report.candidates);
  });
});
