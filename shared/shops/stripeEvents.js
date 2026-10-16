'use strict';

/**
 * FR-239: idempotent Stripe event log (30-day retention for production;
 * in-memory store for unit pins).
 */

function createStripeEventStore() {
  /** @type {Map<string, { id: string, type: string, seenAt: string }>} */
  const byId = new Map();
  return {
    /**
     * @param {string} eventId
     * @returns {boolean} true if already seen
     */
    has(eventId) {
      return byId.has(String(eventId || ''));
    },
    /**
     * @param {{ id: string, type?: string, nowMs?: number }} args
     * @returns {boolean} true if newly recorded
     */
    record(args) {
      const id = String((args && args.id) || '');
      if (!id) return false;
      if (byId.has(id)) return false;
      byId.set(id, {
        id,
        type: String((args && args.type) || ''),
        seenAt: new Date(
          args && args.nowMs != null ? Number(args.nowMs) : Date.now(),
        ).toISOString(),
      });
      return true;
    },
    clear() {
      byId.clear();
    },
    size() {
      return byId.size;
    },
  };
}

/** Production idempotency retention (FR-239 / #3456). */
const STRIPE_EVENT_RETENTION_DAYS = 30;

const STRIPE_EVENTS_DATABASES = new Set(['a_search', 'a_search_sandbox']);

const STRIPE_EVENTS_HAS_SQL =
  'SELECT EventId FROM dbo.StripeEvents WHERE EventId = @eventId';

const STRIPE_EVENTS_INSERT_SQL = `
INSERT INTO dbo.StripeEvents (EventId, EventType, SeenAt)
SELECT @eventId, @eventType, @now
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.StripeEvents WHERE EventId = @eventId
)`.trim();

const STRIPE_EVENTS_PURGE_SQL = `
DELETE FROM dbo.StripeEvents
WHERE SeenAt < DATEADD(day, -@retentionDays, @now)`.trim();

/**
 * @param {string} database
 * @returns {string}
 */
function assertStripeEventsDatabase(database) {
  const name = String(database || '').trim().toLowerCase();
  if (!STRIPE_EVENTS_DATABASES.has(name)) {
    const err = new Error('stripe_events_database');
    err.code = 'stripe_events_database';
    throw err;
  }
  return name;
}

/**
 * SQL StripeEvents writer. Purges rows older than 30 days only on a_search
 * (the production database). a_search_sandbox persists without that delete.
 * @param {{
 *   database: string,
 *   query: (statement: { sql: string, inputs: object, database: string }) => Promise<{ recordset?: object[], rowsAffected?: number|number[] }>,
 * }} deps
 */
function createSqlStripeEventStore(deps) {
  const database = assertStripeEventsDatabase(deps && deps.database);
  const query = deps && deps.query;
  if (typeof query !== 'function') {
    const err = new Error('stripe_events_query_required');
    err.code = 'stripe_events_query_required';
    throw err;
  }
  const purge = database === 'a_search';

  async function run(sql, inputs) {
    return query({ sql, inputs, database });
  }

  return {
    database,
    retentionDays: STRIPE_EVENT_RETENTION_DAYS,
    purges: purge,
    async has(eventId) {
      const id = String(eventId || '');
      if (!id) return false;
      const result = await run(STRIPE_EVENTS_HAS_SQL, { eventId: id });
      const rows = (result && result.recordset) || [];
      return rows.length > 0;
    },
    async record(args) {
      const id = String((args && args.id) || '');
      if (!id) return false;
      const now = new Date(
        args && args.nowMs != null ? Number(args.nowMs) : Date.now(),
      );
      if (purge) {
        await run(STRIPE_EVENTS_PURGE_SQL, {
          now,
          retentionDays: STRIPE_EVENT_RETENTION_DAYS,
        });
      }
      const inserted = await run(STRIPE_EVENTS_INSERT_SQL, {
        eventId: id,
        eventType: String((args && args.type) || ''),
        now,
      });
      const affected = inserted && inserted.rowsAffected;
      const n = Array.isArray(affected)
        ? affected.reduce((sum, value) => sum + Number(value || 0), 0)
        : Number(affected || 0);
      return n > 0;
    },
  };
}

module.exports = {
  createStripeEventStore,
  createSqlStripeEventStore,
  assertStripeEventsDatabase,
  STRIPE_EVENT_RETENTION_DAYS,
  STRIPE_EVENTS_HAS_SQL,
  STRIPE_EVENTS_INSERT_SQL,
  STRIPE_EVENTS_PURGE_SQL,
};
