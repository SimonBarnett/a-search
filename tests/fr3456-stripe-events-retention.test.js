'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createStripeEventStore,
  createSqlStripeEventStore,
  STRIPE_EVENT_RETENTION_DAYS,
  STRIPE_EVENTS_PURGE_SQL,
  STRIPE_EVENTS_INSERT_SQL,
} = require('../shared/shops/stripeEvents');
const { applyMerchantShopStripeEvent } = require('../shared/shops/subscribe');
const { resolveStripeEvents } = require('../entry/src/stripeWebhook');

const DAY_MS = 24 * 60 * 60 * 1000;

function fakeDb() {
  /** @type {Map<string, { seenAt: Date, type: string }>} */
  const rows = new Map();
  /** @type {object[]} */
  const calls = [];
  async function query(statement) {
    calls.push(statement);
    const sql = String(statement.sql || '');
    if (sql.startsWith('DELETE')) {
      const now = statement.inputs.now.getTime();
      const days = Number(statement.inputs.retentionDays);
      const cutoff = now - days * DAY_MS;
      for (const [id, row] of rows) {
        if (row.seenAt.getTime() < cutoff) rows.delete(id);
      }
      return { rowsAffected: [0] };
    }
    if (sql.startsWith('SELECT')) {
      const row = rows.get(statement.inputs.eventId);
      return { recordset: row ? [{ EventId: statement.inputs.eventId }] : [] };
    }
    if (rows.has(statement.inputs.eventId)) return { rowsAffected: [0] };
    rows.set(statement.inputs.eventId, {
      type: statement.inputs.eventType,
      seenAt: statement.inputs.now,
    });
    return { rowsAffected: [1] };
  }
  return { query, calls, rows };
}

describe('FR #3456 StripeEvents retention', () => {
  it('keeps the in-memory store for unit pins', () => {
    const events = createStripeEventStore();
    assert.equal(events.record({ id: 'evt_mem', type: 'invoice.paid' }), true);
    assert.equal(events.has('evt_mem'), true);
    assert.equal(events.record({ id: 'evt_mem', type: 'invoice.paid' }), false);
  });

  it('persists event ids and purges rows older than 30 days on a_search', async () => {
    const db = fakeDb();
    const now = Date.parse('2026-10-16T00:00:00Z');
    db.rows.set('evt_old', {
      type: 'invoice.paid',
      seenAt: new Date(now - 31 * DAY_MS),
    });
    const events = createSqlStripeEventStore({
      database: 'a_search',
      query: db.query,
    });
    assert.equal(events.purges, true);
    assert.equal(events.retentionDays, 30);
    assert.equal(STRIPE_EVENT_RETENTION_DAYS, 30);
    assert.match(STRIPE_EVENTS_PURGE_SQL, /DELETE FROM dbo\.StripeEvents/);
    assert.match(STRIPE_EVENTS_INSERT_SQL, /INSERT INTO dbo\.StripeEvents/);
    assert.equal(await events.record({ id: 'evt_new', type: 'invoice.paid', nowMs: now }), true);
    assert.equal(db.rows.has('evt_old'), false);
    assert.equal(db.rows.has('evt_new'), true);
    const purge = db.calls.find((call) => String(call.sql).startsWith('DELETE'));
    assert.equal(purge.inputs.retentionDays, 30);
    assert.equal(purge.database, 'a_search');
    assert.equal(await events.has('evt_new'), true);
    assert.equal(await events.record({ id: 'evt_new', type: 'invoice.paid', nowMs: now }), false);
  });

  it('persists on a_search_sandbox without the production purge', async () => {
    const db = fakeDb();
    const events = createSqlStripeEventStore({
      database: 'a_search_sandbox',
      query: db.query,
    });
    assert.equal(events.purges, false);
    assert.equal(await events.record({ id: 'evt_sbx', type: 'invoice.paid', nowMs: 1 }), true);
    assert.equal(db.calls.some((call) => String(call.sql).startsWith('DELETE')), false);
    assert.equal(db.rows.has('evt_sbx'), true);
  });

  it('refuses a database that is not a_search', () => {
    assert.throws(
      () => createSqlStripeEventStore({ database: 'madeiradb', query: async () => ({}) }),
      (err) => err && err.code === 'stripe_events_database',
    );
  });

  it('webhook uses the SQL store when the production database is configured', async () => {
    const db = fakeDb();
    const events = resolveStripeEvents({
      env: { MSSQL_DATABASE: 'a_search' },
      sqlQuery: db.query,
    });
    assert.equal(events.database, 'a_search');
    assert.equal(events.purges, true);
    const dupStore = createSqlStripeEventStore({ database: 'a_search', query: db.query });
    await dupStore.record({ id: 'evt_dup', type: 'customer.subscription.updated', nowMs: 10 });
    const result = await applyMerchantShopStripeEvent({
      event: { id: 'evt_dup', type: 'customer.subscription.updated', data: { object: {} } },
      events: dupStore,
    });
    assert.equal(result.duplicate, true);
  });

  it('webhook stays on the in-memory prelude when no database is set', () => {
    const events = resolveStripeEvents({ env: {} });
    assert.equal(typeof events.clear, 'function');
    assert.equal(events.record({ id: 'evt_local', type: 'x' }), true);
  });
});
