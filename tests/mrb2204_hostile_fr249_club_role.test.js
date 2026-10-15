'use strict';

/**
 * MRB #2204 hostile pins for FR-249 / #1363.
 * Empty JWT role must 403; club isolation; invalid period; madeiradb never written.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  createRevenueShareStore,
} = require('../shared/finance/revenueShare');
const {
  handleClubRevenueShare,
  matchClubRevenueShareRoute,
} = require('../entry/src/clubRevenueShare');

describe('MRB #2204 hostile FR-249 club revenue-share', () => {
  it('requires JWT role=club; empty role is 403 forbidden_not_club', async () => {
    const store = createRevenueShareStore();
    store.setBudget('2026-05', 1000, 'admin');
    store.closePeriod({
      periodId: '2026-05',
      clickRows: [{ clubId: 'CLUBA', clicks: 1, partClass: 'merchant' }],
    });
    const emptyRole = await handleClubRevenueShare(
      {
        headers: { authorization: 'Bearer x' },
        queryStringParameters: { period: '2026-05' },
      },
      {
        revenueShareStore: store,
        verifyAuthorization: async () => ({
          userId: 'CLUBA',
          clubId: 'CLUBA',
        }),
      },
    );
    assert.equal(emptyRole.statusCode, 403);
    assert.equal(JSON.parse(emptyRole.body).error, 'forbidden_not_club');

    const ok = await handleClubRevenueShare(
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
    assert.equal(ok.statusCode, 200);
    assert.equal(JSON.parse(ok.body).ok, true);
  });

  it('invalid period -> 400; other club sees zeros not peer share', async () => {
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
    const bad = await handleClubRevenueShare(
      {
        headers: { authorization: 'Bearer x' },
        queryStringParameters: { period: '2026-5' },
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
    assert.equal(bad.statusCode, 400);
    assert.equal(JSON.parse(bad.body).error, 'invalid_period');

    const peer = await handleClubRevenueShare(
      {
        headers: { authorization: 'Bearer x' },
        queryStringParameters: { period: '2026-05' },
      },
      {
        revenueShareStore: store,
        verifyAuthorization: async () => ({
          userId: 'CLUBB',
          role: 'club',
          clubId: 'CLUBB',
        }),
      },
    );
    assert.equal(peer.statusCode, 200);
    const body = JSON.parse(peer.body);
    assert.equal(body.clicks, 1);
    assert.equal(body.clubShareMinor, Math.floor((1000 * 1) / 4));
    assert.notEqual(body.clubShareMinor, Math.floor((1000 * 3) / 4));
  });

  it('migration 013 never touches madeiradb; FR-249 Decision LOCKED on tip', () => {
    const sql = fs.readFileSync(
      path.join(ROOT, 'db', 'migrations', '013_RevenueShare.sql'),
      'utf8',
    );
    assert.match(sql, /Never modify madeiradb/i);
    assert.doesNotMatch(sql, /USE\s+madeiradb/i);
    assert.doesNotMatch(sql, /ALTER\s+TABLE\s+mdb\./i);
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-249.md'), 'utf8');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /JWT club role/);
  });
});
