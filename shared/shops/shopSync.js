'use strict';

/**
 * FR-240: Shop go-live full import + weekly refresh via maintainer roll.
 * Message bodies never carry credentials (vault pointer on Shop only).
 * Injectable stores/queue for offline pins; SQL/SQS wired at deploy.
 */

const { mergePartsSetBased } = require('../../maintainer/src/upsert');
const { scopedDeleteParts } = require('../../maintainer/src/delete');

const DEFAULT_REFRESH_DAYS = 7;
const CREDENTIAL_KEYS = Object.freeze([
  'consumerKey',
  'consumerSecret',
  'accessToken',
  'clientSecret',
  'apiSecret',
  'password',
  'credentials',
  'token',
]);

/**
 * Paid gate (Simon): only `active` is paid for merchant shops.
 * `trialing` is unpaid. past_due / unpaid / null skip.
 * @param {object|null} shop
 */
function isShopPaid(shop) {
  if (!shop) return false;
  return String(shop.subscriptionStatus || '') === 'active';
}

/**
 * ISO week id yyyy-Www for refresh dedupe.
 * @param {Date} d
 */
function isoWeekId(d) {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function assertNoCredentials(body) {
  const raw = JSON.stringify(body || {});
  for (const k of CREDENTIAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body || {}, k)) {
      const err = new Error('sync_message_must_not_carry_credentials');
      err.code = 'sync_message_must_not_carry_credentials';
      throw err;
    }
    if (new RegExp(`"${k}"\\s*:`).test(raw)) {
      const err = new Error('sync_message_must_not_carry_credentials');
      err.code = 'sync_message_must_not_carry_credentials';
      throw err;
    }
  }
}

/**
 * In-memory PartFeedKeys (Kind/Active/Locator for FR-240).
 */
function createPartFeedKeysStore() {
  /** @type {object[]} */
  const rows = [];

  function upsertShopKey(args) {
    const Source = String(args.Source || args.provider).toLowerCase();
    const FeedKey = String(args.FeedKey || args.shopId);
    const Env = String(args.Env || args.env);
    let row = rows.find(
      (r) => r.Source === Source && r.FeedKey === FeedKey && r.Env === Env,
    );
    const now = args.now instanceof Date ? args.now : new Date(args.nowMs || Date.now());
    if (!row) {
      let nextCheck = now.toISOString();
      if (args.NextCheck != null) {
        nextCheck =
          args.NextCheck instanceof Date
            ? args.NextCheck.toISOString()
            : String(args.NextCheck);
      }
      row = {
        Source,
        FeedKey,
        Env,
        Kind: 'shop',
        Active: args.Active != null ? Number(args.Active) : 1,
        Locator: String(args.Locator || args.shopDomain || ''),
        NextCheck: nextCheck,
        LastChecked: null,
        LastError: null,
        ContentHash: null,
        CreatedAt: now.toISOString(),
        UpdatedAt: now.toISOString(),
      };
      rows.push(row);
    } else {
      row.Kind = 'shop';
      row.Active = args.Active != null ? Number(args.Active) : 1;
      if (args.Locator != null || args.shopDomain != null) {
        row.Locator = String(args.Locator || args.shopDomain);
      }
      if (args.NextCheck != null) {
        row.NextCheck =
          args.NextCheck instanceof Date
            ? args.NextCheck.toISOString()
            : String(args.NextCheck);
      }
      row.UpdatedAt = now.toISOString();
    }
    return { ...row };
  }

  function get(Source, FeedKey, Env) {
    const row = rows.find(
      (r) =>
        r.Source === String(Source).toLowerCase() &&
        r.FeedKey === String(FeedKey) &&
        r.Env === String(Env),
    );
    return row ? { ...row } : null;
  }

  function setActive(Source, FeedKey, Env, active) {
    const row = rows.find(
      (r) =>
        r.Source === String(Source).toLowerCase() &&
        r.FeedKey === String(FeedKey) &&
        r.Env === String(Env),
    );
    if (!row) return null;
    row.Active = active ? 1 : 0;
    row.UpdatedAt = new Date().toISOString();
    return { ...row };
  }

  function bumpAfterSuccess(Source, FeedKey, Env, opts) {
    const row = rows.find(
      (r) =>
        r.Source === String(Source).toLowerCase() &&
        r.FeedKey === String(FeedKey) &&
        r.Env === String(Env),
    );
    if (!row) return null;
    const now = opts && opts.now instanceof Date ? opts.now : new Date();
    const days =
      opts && opts.refreshDays != null
        ? Number(opts.refreshDays)
        : DEFAULT_REFRESH_DAYS;
    row.LastChecked = now.toISOString();
    row.LastError = null;
    if (opts && opts.contentHash != null) row.ContentHash = String(opts.contentHash);
    const next = new Date(now.getTime() + days * 86400000);
    row.NextCheck = next.toISOString();
    row.UpdatedAt = now.toISOString();
    return { ...row };
  }

  function bumpBackoff(Source, FeedKey, Env, hours, errMsg) {
    const row = rows.find(
      (r) =>
        r.Source === String(Source).toLowerCase() &&
        r.FeedKey === String(FeedKey) &&
        r.Env === String(Env),
    );
    if (!row) return null;
    const now = new Date();
    row.LastError = String(errMsg || 'error');
    row.NextCheck = new Date(now.getTime() + Number(hours) * 3600000).toISOString();
    row.UpdatedAt = now.toISOString();
    return { ...row };
  }

  function listDueShopKeys(opts) {
    const now = opts && opts.now instanceof Date ? opts.now : new Date();
    const env = opts && opts.env;
    return rows
      .filter((r) => {
        if (r.Kind !== 'shop') return false;
        if (!r.Active) return false;
        if (env && r.Env !== String(env)) return false;
        if (r.NextCheck == null) return true;
        return new Date(r.NextCheck).getTime() <= now.getTime();
      })
      .map((r) => ({ ...r }));
  }

  function listAll() {
    return rows.map((r) => ({ ...r }));
  }

  function deleteKey(Source, FeedKey, Env) {
    const i = rows.findIndex(
      (r) =>
        r.Source === String(Source).toLowerCase() &&
        r.FeedKey === String(FeedKey) &&
        r.Env === String(Env),
    );
    if (i < 0) return false;
    rows.splice(i, 1);
    return true;
  }

  return {
    upsertShopKey,
    get,
    setActive,
    bumpAfterSuccess,
    bumpBackoff,
    listDueShopKeys,
    listAll,
    deleteKey,
  };
}

/**
 * In-memory Parts table for shop-sync pins.
 */
function createPartsStore() {
  /** @type {object[]} */
  let parts = [];

  function all() {
    return parts.map((p) => ({ ...p }));
  }

  function activeForFeed(source, feedKey, env) {
    return parts.filter(
      (p) =>
        String(p.Source) === String(source) &&
        String(p.FeedKey) === String(feedKey) &&
        String(p.Env) === String(env) &&
        !p.DeletedAt,
    );
  }

  function mergeStaging(staging, source, feedKey, env) {
    const scoped = (staging || []).map((r) => ({
      ...r,
      Source: String(source),
      FeedKey: String(feedKey),
      Env: String(env),
      DeletedAt: null,
    }));
    const result = mergePartsSetBased({ staging: scoped, parts });
    parts = result.parts;
    return result;
  }

  function softDeleteMissing(staging, source, feedKey, env, now) {
    const result = scopedDeleteParts({
      parts,
      staging: (staging || []).map((r) => ({
        ...r,
        Source: String(source),
        FeedKey: String(feedKey),
        Env: String(env),
      })),
      source,
      feedKey,
      env,
      now: now instanceof Date ? now : new Date(),
    });
    parts = result.parts;
    return result;
  }

  function hardDeleteFeed(source, feedKey, env) {
    const before = parts.length;
    parts = parts.filter(
      (p) =>
        !(
          String(p.Source) === String(source) &&
          String(p.FeedKey) === String(feedKey) &&
          String(p.Env) === String(env)
        ),
    );
    return { deleted: before - parts.length };
  }

  function softDeleteFeed(source, feedKey, env, now) {
    const at = (now instanceof Date ? now : new Date()).toISOString();
    let n = 0;
    parts = parts.map((p) => {
      const inScope =
        String(p.Source) === String(source) &&
        String(p.FeedKey) === String(feedKey) &&
        String(p.Env) === String(env);
      if (!inScope || p.DeletedAt) return p;
      n += 1;
      return { ...p, DeletedAt: at };
    });
    return { deleted: n };
  }

  return {
    all,
    activeForFeed,
    mergeStaging,
    softDeleteMissing,
    softDeleteFeed,
    hardDeleteFeed,
  };
}

/**
 * Fake SQS FIFO: one in-flight group per shopId.
 */
function createShopSyncQueue() {
  /** @type {object[]} */
  const messages = [];
  /** @type {Set<string>} */
  const dedupeSeen = new Set();
  /** @type {object[]} */
  const dlq = [];
  /** @type {Map<string, number>} */
  const receiveCounts = new Map();

  function send(msg) {
    assertNoCredentials(msg.body || msg);
    const body = { ...(msg.body || msg) };
    assertNoCredentials(body);
    const groupId = String(msg.MessageGroupId || body.shopId);
    const dedupeId = String(msg.MessageDeduplicationId || '');
    if (dedupeId && dedupeSeen.has(dedupeId)) {
      return { sent: false, reason: 'duplicate' };
    }
    if (dedupeId) dedupeSeen.add(dedupeId);
    const id = `msg_${messages.length + 1}`;
    messages.push({
      id,
      MessageGroupId: groupId,
      MessageDeduplicationId: dedupeId,
      body,
      receiveCount: 0,
    });
    return { sent: true, id };
  }

  function receive(groupId) {
    const m = messages.find(
      (x) =>
        !x.deleted &&
        (groupId == null || x.MessageGroupId === String(groupId)),
    );
    if (!m) return null;
    m.receiveCount += 1;
    receiveCounts.set(m.id, m.receiveCount);
    if (m.receiveCount > 5) {
      dlq.push({ ...m, body: { ...m.body } });
      m.deleted = true;
      return null;
    }
    return { ...m, body: { ...m.body } };
  }

  function deleteMessage(id) {
    const m = messages.find((x) => x.id === String(id));
    if (m) m.deleted = true;
  }

  function pending() {
    return messages.filter((m) => !m.deleted).map((m) => ({ ...m, body: { ...m.body } }));
  }

  function deadLetters() {
    return dlq.map((m) => ({ ...m, body: { ...m.body } }));
  }

  return { send, receive, deleteMessage, pending, deadLetters };
}

/**
 * Build go-live full sync message (no credentials).
 */
function buildFullSyncMessage(shop, opts) {
  const liveAt = shop.liveAt || (opts && opts.now && opts.now.toISOString()) || new Date().toISOString();
  const subId = shop.stripeSubscriptionId || 'nosub';
  const body = {
    type: 'full',
    env: String(shop.env),
    shopId: String(shop.shopId),
    provider: String(shop.provider),
  };
  assertNoCredentials(body);
  return {
    MessageGroupId: String(shop.shopId),
    MessageDeduplicationId: `${shop.shopId}:full:${subId}:${liveAt}`,
    body,
  };
}

function buildRefreshSyncMessage(shop, now) {
  const d = now instanceof Date ? now : new Date();
  const body = {
    type: 'refresh',
    env: String(shop.env),
    shopId: String(shop.shopId),
    provider: String(shop.provider),
  };
  assertNoCredentials(body);
  return {
    MessageGroupId: String(shop.shopId),
    MessageDeduplicationId: `${shop.shopId}:refresh:${isoWeekId(d)}`,
    body,
  };
}

/**
 * Go-live: upsert PartFeedKeys Kind=shop + enqueue full (paid only).
 */
function onShopLive(args) {
  const shop = args.shop;
  const feedKeys = args.feedKeys;
  const queue = args.queue;
  const log = args.log || (() => {});
  if (!isShopPaid(shop)) {
    log({ type: 'ShopSyncSkipped', reason: 'unpaid', shopId: shop.shopId });
    return { enqueued: false, reason: 'unpaid' };
  }
  feedKeys.upsertShopKey({
    provider: shop.provider,
    shopId: shop.shopId,
    env: shop.env,
    shopDomain: shop.shopDomain,
    nowMs: args.nowMs,
    Active: 1,
    NextCheck: args.now instanceof Date ? args.now : new Date(args.nowMs || Date.now()),
  });
  const msg = buildFullSyncMessage(shop, { now: args.now });
  const sent = queue.send(msg);
  return { enqueued: sent.sent, message: msg, ...sent };
}

/**
 * Weekly roll: due Kind=shop keys whose Shop is live + paid.
 */
function rollShopRefresh(args) {
  const feedKeys = args.feedKeys;
  const shops = args.shops;
  const queue = args.queue;
  const now = args.now instanceof Date ? args.now : new Date();
  const env = args.env;
  const log = args.log || (() => {});
  const due = feedKeys.listDueShopKeys({ now, env });
  const enqueued = [];
  for (const key of due) {
    const shop = shops.get(key.FeedKey);
    if (!shop || shop.status !== 'live') {
      log({ type: 'ShopSyncSkipped', reason: 'not_live', shopId: key.FeedKey });
      continue;
    }
    if (!isShopPaid(shop)) {
      log({ type: 'ShopSyncSkipped', reason: 'unpaid', shopId: shop.shopId });
      continue;
    }
    const msg = buildRefreshSyncMessage(shop, now);
    const sent = queue.send(msg);
    if (sent.sent) enqueued.push({ shopId: shop.shopId, id: sent.id });
  }
  return { due: due.length, enqueued };
}

/**
 * Consumer: paid check before provider call; merge + soft-delete missing.
 */
async function handleShopSyncMessage(args) {
  const msg = args.message;
  const body = msg.body || {};
  assertNoCredentials(body);
  const shops = args.shops;
  const feedKeys = args.feedKeys;
  const parts = args.parts;
  const vault = args.vault;
  const queue = args.queue;
  const now = args.now instanceof Date ? args.now : new Date();
  const refreshDays =
    args.refreshDays != null ? Number(args.refreshDays) : DEFAULT_REFRESH_DAYS;
  const fetchCatalog =
    args.fetchCatalog ||
    (async () => {
      throw new Error('fetchCatalog_required');
    });
  const sendEmail = args.sendEmail || (async () => {});
  const log = args.log || (() => {});

  const shop = shops.get(body.shopId);
  if (!shop) {
    queue.deleteMessage(msg.id);
    return { ok: false, reason: 'shop_not_found' };
  }

  if (!isShopPaid(shop)) {
    shops.recordSyncSummary(shop.shopId, {
      lastSyncAt: now.toISOString(),
      lastSyncResult: 'skipped_unpaid',
    });
    queue.deleteMessage(msg.id);
    log({ type: 'ShopSyncSkipped', reason: 'unpaid', shopId: shop.shopId });
    return { ok: true, skipped: true, reason: 'unpaid', catalogCalls: 0 };
  }

  // Credentials from vault only — never from message.
  const secretRef = shop.credentialsSecretRef;
  const creds =
    vault && secretRef && typeof vault.get === 'function'
      ? vault.get(secretRef)
      : args.credentials || null;

  let catalogCalls = 0;
  let products;
  try {
    catalogCalls += 1;
    products = await fetchCatalog({
      shop,
      credentials: creds,
      type: body.type,
    });
  } catch (err) {
    const code = (err && err.code) || '';
    const status = Number(err && err.statusCode) || 0;
    if (status === 401 || status === 403 || code === 'auth' || code === 'unauthorized') {
      shops.transition(shop.shopId, 'suspended', { reason: 'auth', nowMs: now.getTime() });
      feedKeys.setActive(shop.provider, shop.shopId, shop.env, false);
      await sendEmail({
        to: shop.merchantUserId,
        template: 'shop_reconnect',
        shopId: shop.shopId,
      });
      queue.deleteMessage(msg.id);
      return { ok: false, reason: 'auth', catalogCalls };
    }
    if (status === 429 || status >= 500 || code === 'rate_limited') {
      const hours = msg.receiveCount >= 3 ? 24 : msg.receiveCount >= 2 ? 4 : 1;
      feedKeys.bumpBackoff(
        shop.provider,
        shop.shopId,
        shop.env,
        hours,
        String((err && err.message) || 'backoff'),
      );
      // leave message for retry (do not delete)
      return { ok: false, reason: 'backoff', hours, catalogCalls };
    }
    throw err;
  }

  const staging = (products || []).map((p, i) => ({
    Source: shop.provider,
    FeedKey: shop.shopId,
    Env: shop.env,
    MerchantProductId: String(p.id != null ? p.id : p.MerchantProductId || i),
    Title: String(p.title || p.name || p.Title || ''),
    ProductUrl: String(
      p.url ||
        p.ProductUrl ||
        `https://${shop.shopDomain}/products/${p.id != null ? p.id : i}`,
    ),
    ContentHash: String(p.contentHash || p.ContentHash || `${p.id}:${p.title || p.name || ''}`),
  }));

  parts.mergeStaging(staging, shop.provider, shop.shopId, shop.env);
  parts.softDeleteMissing(staging, shop.provider, shop.shopId, shop.env, now);

  const active = parts.activeForFeed(shop.provider, shop.shopId, shop.env);
  const keyAfter = feedKeys.bumpAfterSuccess(shop.provider, shop.shopId, shop.env, {
    now,
    refreshDays,
  });
  shops.recordSyncSummary(shop.shopId, {
    lastSyncAt: now.toISOString(),
    nextSyncAt: keyAfter && keyAfter.NextCheck,
    partsCount: active.length,
    lastSyncResult: 'ok',
  });
  queue.deleteMessage(msg.id);
  return {
    ok: true,
    partsCount: active.length,
    catalogCalls,
    type: body.type,
  };
}

/**
 * Suspend/cancel: deactivate feed key + soft-delete Parts for that FeedKey.
 */
function onShopStopServing(args) {
  const shop = args.shop;
  const feedKeys = args.feedKeys;
  const parts = args.parts;
  const now = args.now instanceof Date ? args.now : new Date();
  feedKeys.setActive(shop.provider, shop.shopId, shop.env, false);
  const del = parts.softDeleteFeed(shop.provider, shop.shopId, shop.env, now);
  return { deactivated: true, deleted: del.deleted };
}

module.exports = {
  DEFAULT_REFRESH_DAYS,
  CREDENTIAL_KEYS,
  isShopPaid,
  isoWeekId,
  assertNoCredentials,
  createPartFeedKeysStore,
  createPartsStore,
  createShopSyncQueue,
  buildFullSyncMessage,
  buildRefreshSyncMessage,
  onShopLive,
  rollShopRefresh,
  handleShopSyncMessage,
  onShopStopServing,
};
