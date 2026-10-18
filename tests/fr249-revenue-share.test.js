'use strict';

/**
 * FR-249 / #1363: monthly club budget split by merchant-part clicks.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-249.md');
const MIGRATION = path.join(ROOT, 'db', 'migrations', '013_RevenueShare.sql');
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');
const INDEX = path.join(ROOT, 'entry', 'src', 'index.js');

const {
  RULE_VERSION,
  RevenueShareError,
  merchantClicksByClub,
  splitBudgetByClicks,
  createRevenueShareStore,
} = require('../shared/finance/revenueShare');
const {
  matchClubRevenueShareRoute,
  handleClubRevenueShare,
} = require('../entry/src/clubRevenueShare');

function utf8NoBomAscii(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  assert.notEqual(buf[0], 0xef, `${rel} BOM`);
  const text = buf.toString('utf8');
  for (let i = 0; i < text.length; i += 1) {
    assert.ok(
      text.charCodeAt(i) < 128,
      `${rel} non-ASCII at ${i}`,
    );
  }
  return text;
}

describe('FR-249 revenue share budget + clicks', () => {
  it('docs/fr/FR-249.md Decision LOCKED ASCII no-BOM', () => {
    const text = utf8NoBomAscii('docs/fr/FR-249.md');
    assert.match(text, /Decision \(LOCKED\)/);
    assert.match(text, /ClubPoolBudget/);
    assert.match(text, /clicks only/i);
    assert.match(text, /\/club\/revenue-share/);
    assert.match(text, /013_RevenueShare/);
    assert.match(text, /No pool-percentage config/);
    assert.match(text, /Impression blend weights are withdrawn/);
  });

  it('migration 013 creates ClubPoolBudget / RevenueSharePeriods / ClubRevenueShares', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    assert.match(sql, /ClubPoolBudget/);
    assert.match(sql, /RevenueSharePeriods/);
    assert.match(sql, /ClubRevenueShares/);
    assert.match(sql, /Never modify madeiradb/i);
    assert.doesNotMatch(sql, /^<<<<<<<|^=======|^>>>>>>>/m);
  });

  it('ignores non-merchant and widget_upgrade click rows', () => {
    const by = merchantClicksByClub([
      { clubId: 'CLUBA', clicks: 10, partClass: 'merchant' },
      { clubId: 'CLUBA', clicks: 5, partClass: 'affiliate' },
      { clubId: 'CLUBB', clicks: 3, class: 'provider' },
      { clubId: 'CLUBC', clicks: 7, partClass: 'merchant', source: 'widget_upgrade' },
    ]);
    // widget_upgrade filtered at closePeriod; merchantClicksByClub still counts class
    assert.equal(by.get('CLUBA'), 10);
    assert.equal(by.has('CLUBB'), false);
    assert.equal(by.get('CLUBC'), 7);
  });

  it('split floor-to-penny; remainder unallocated; three clubs', () => {
    const by = new Map([
      ['CLUBA', 10],
      ['CLUBB', 5],
      ['CLUBC', 3],
    ]);
    // budget 1000 minor; total clicks 18
    const split = splitBudgetByClicks(1000, by);
    assert.equal(split.totalClicks, 18);
    const a = split.shares.find((s) => s.clubId === 'CLUBA');
    const b = split.shares.find((s) => s.clubId === 'CLUBB');
    const c = split.shares.find((s) => s.clubId === 'CLUBC');
    assert.equal(a.amountMinor, Math.floor((1000 * 10) / 18));
    assert.equal(b.amountMinor, Math.floor((1000 * 5) / 18));
    assert.equal(c.amountMinor, Math.floor((1000 * 3) / 18));
    assert.equal(
      split.allocatedMinor + split.remainderMinor,
      1000,
    );
    assert.ok(split.remainderMinor >= 0);
  });

  it('zero total clicks -> unspent rollOut; budget recorded', () => {
    const store = createRevenueShareStore();
    store.setBudget('2026-09', 5000, 'simon', 'sept budget');
    const result = store.closePeriod({
      periodId: '2026-09',
      clickRows: [
        { clubId: 'CLUBA', clicks: 4, partClass: 'affiliate' },
      ],
      closedAt: '2026-10-05T00:00:00.000Z',
    });
    assert.equal(result.noop, false);
    assert.equal(result.period.totalClicks, 0);
    assert.equal(result.period.allocatedMinor, 0);
    assert.equal(result.period.rollOutMinor, 5000);
    assert.equal(result.period.remainderMinor, 5000);
    assert.equal(result.shares.length, 0);
  });

  it('close fails when ClubPoolBudget unset', () => {
    const store = createRevenueShareStore();
    assert.throws(
      () =>
        store.closePeriod({
          periodId: '2026-08',
          clickRows: [
            { clubId: 'CLUBA', clicks: 1, partClass: 'merchant' },
          ],
        }),
      (err) =>
        err instanceof RevenueShareError && err.code === 'budget_unset',
    );
  });

  it('close is idempotent; closed period immutable on re-run', () => {
    const store = createRevenueShareStore();
    store.setBudget('2026-07', 900, 'admin');
    const rows = [
      { clubId: 'CLUBA', clicks: 2, partClass: 'merchant' },
      { clubId: 'CLUBB', clicks: 1, partClass: 'merchant' },
    ];
    const first = store.closePeriod({
      periodId: '2026-07',
      clickRows: rows,
      closedAt: '2026-08-05T12:00:00.000Z',
      inputsChecksum: 'abc',
    });
    assert.equal(first.noop, false);
    assert.equal(first.period.status, 'closed');
    assert.equal(first.period.ruleVersion, RULE_VERSION);
    const second = store.closePeriod({
      periodId: '2026-07',
      clickRows: [
        { clubId: 'CLUBA', clicks: 99, partClass: 'merchant' },
      ],
      closedAt: '2026-08-06T00:00:00.000Z',
    });
    assert.equal(second.noop, true);
    assert.equal(second.period.closedAt, first.period.closedAt);
    assert.deepEqual(second.shares, first.shares);
  });

  it('widget_upgrade source rows excluded at close', () => {
    const store = createRevenueShareStore();
    store.setBudget('2026-06', 1000, 'admin');
    const result = store.closePeriod({
      periodId: '2026-06',
      clickRows: [
        {
          clubId: 'CLUBA',
          clicks: 10,
          partClass: 'merchant',
          source: 'widget_upgrade',
        },
        { clubId: 'CLUBB', clicks: 10, partClass: 'merchant' },
      ],
    });
    assert.equal(result.period.totalClicks, 10);
    const a = result.shares.find((s) => s.clubId === 'CLUBA');
    const b = result.shares.find((s) => s.clubId === 'CLUBB');
    assert.equal(a, undefined);
    assert.equal(b.amountMinor, 1000);
  });

  it('GET /club/revenue-share returns own club data; 403 for other role', async () => {
    assert.equal(
      matchClubRevenueShareRoute('GET', '/club/revenue-share'),
      'GET /club/revenue-share',
    );
    const store = createRevenueShareStore();
    store.setBudget('2026-05', 1000, 'admin');
    store.closePeriod({
      periodId: '2026-05',
      clickRows: [
        { clubId: 'CLUBA', clicks: 3, partClass: 'merchant' },
        { clubId: 'CLUBB', clicks: 1, partClass: 'merchant' },
      ],
    });

    const own = await handleClubRevenueShare(
      {
        headers: { authorization: 'Bearer x' },
        queryStringParameters: { period: '2026-05' },
      },
      {
        revenueShareStore: store,
        verifyAuthorization: async () => ({
          userId: 'CLUBA',
          role: 'club',
          clubId: 'CLUBA',
        }),
      },
    );
    assert.equal(own.statusCode, 200);
    const body = JSON.parse(own.body);
    assert.equal(body.ok, true);
    assert.equal(body.period, '2026-05');
    assert.equal(body.status, 'closed');
    assert.equal(body.clicks, 3);
    assert.equal(body.clubShareMinor, Math.floor((1000 * 3) / 4));
    assert.equal(body.impressions, 0);

    const forbidden = await handleClubRevenueShare(
      {
        headers: { authorization: 'Bearer x' },
        queryStringParameters: { period: '2026-05' },
      },
      {
        revenueShareStore: store,
        verifyAuthorization: async () => ({
          userId: 'PART1',
          role: 'partner',
          clubId: 'PART1',
        }),
      },
    );
    assert.equal(forbidden.statusCode, 403);
    assert.equal(JSON.parse(forbidden.body).error, 'forbidden_not_club');
  });

  it('entry + CDK wire GET /club/revenue-share; computation has no pool pct / impressions weights', () => {
    const index = fs.readFileSync(INDEX, 'utf8');
    assert.match(index, /matchClubRevenueShareRoute/);
    assert.match(index, /handleClubRevenueShare/);
    assert.match(index, /\/club\/revenue-share|CLUB_REVENUE_SHARE/);
    const stack = fs.readFileSync(STACK, 'utf8');
    assert.match(stack, /\/club\/revenue-share/);
    const mod = fs.readFileSync(
      path.join(ROOT, 'shared', 'finance', 'revenueShare.js'),
      'utf8',
    );
    assert.doesNotMatch(mod, /CLUB_POOL_PCT/);
    assert.doesNotMatch(mod, /W_CLICK|W_IMPR/);
    assert.match(mod, /clicks_only/);
  });
});
