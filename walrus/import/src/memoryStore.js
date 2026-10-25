'use strict';

/**
 * FR #4463: in-memory Parts + ingest store for unit tests (no live MSSQL).
 */

function createMemoryStore(opts = {}) {
  const env = opts.env || 'sandbox';
  /** @type {Map<string, object>} */
  const parts = new Map();
  const importFiles = new Map();
  const failures = [];
  const rejects = [];
  /** @type {object[]} leftover dbo.PartsStaging rows (FR #4941) */
  const leftoverStaging = [];
  const purgeRequests = [];
  const runFeeds = [];
  let runSeq = 0;
  let failureSeq = 0;
  const indexesDisabled = new Set(opts.disabledIndexes || []);
  let ftsEnabled = opts.ftsEnabled !== false;
  let ftsPending = 0;
  let appLockHeld = false;

  function partKey(source, feedKey, mpid) {
    return `${source}|${feedKey}|${mpid}|${env}`;
  }

  function beginRun(mode) {
    runSeq += 1;
    return {
      runId: runSeq,
      mode: mode || 'run',
      startedAt: new Date().toISOString(),
      status: 'running',
      exitCode: null,
    };
  }

  function tryAppLock() {
    if (appLockHeld) return false;
    appLockHeld = true;
    return true;
  }

  function releaseAppLock() {
    appLockHeld = false;
  }

  function forceHoldAppLock(held) {
    appLockHeld = !!held;
  }

  function seedPart(row) {
    const source = row.Source;
    const feedKey = row.FeedKey;
    const mpid = String(row.MerchantProductId);
    parts.set(partKey(source, feedKey, mpid), {
      Source: source,
      FeedKey: feedKey,
      MerchantProductId: mpid,
      Env: env,
      DeletedAt: row.DeletedAt || null,
      LastSeenRunId: row.LastSeenRunId == null ? null : row.LastSeenRunId,
      ContentHash: row.ContentHash || '',
    });
  }

  function listActive(source, feedKey) {
    const out = [];
    for (const row of parts.values()) {
      if (row.Source === source && row.FeedKey === feedKey && row.Env === env && !row.DeletedAt) {
        out.push(row);
      }
    }
    return out;
  }

  function mergeFeed(opts) {
    const {
      runId,
      providerId,
      feedKey,
      className,
      staged,
      deleteMissing,
      dryRun,
      largeFeedRows,
      failAfterBatch,
    } = opts;
    const active = listActive(providerId, feedKey);
    const stagedKeys = new Set(staged.map((r) => String(r.MerchantProductId)));
    const activeMap = new Map(active.map((r) => [r.MerchantProductId, r]));

    let wouldInsert = 0;
    let wouldUpdate = 0;
    let wouldDelete = 0;
    for (const s of staged) {
      const prev = activeMap.get(String(s.MerchantProductId));
      if (!prev) wouldInsert += 1;
      else if (prev.ContentHash !== s.ContentHash) wouldUpdate += 1;
    }
    if (deleteMissing === 'soft' || deleteMissing === 'hard') {
      for (const a of active) {
        // FR #4942 / MRB #4944: dry-run must match DeleteMissing (skip NULL LastSeen).
        if (a.LastSeenRunId == null) continue;
        if (!stagedKeys.has(a.MerchantProductId)) wouldDelete += 1;
      }
    }

    if (dryRun) {
      return {
        inserted: 0,
        updated: 0,
        deleted: 0,
        wouldInsert,
        wouldUpdate,
        wouldDelete,
      };
    }

    const threshold = largeFeedRows != null ? largeFeedRows : 500000;
    // Production default 50k; when tests lower largeFeedRows, shrink batches so mid-batch faults are reachable.
    const batchSize =
      opts.batchSize != null
        ? Number(opts.batchSize)
        : threshold < 1000
          ? Math.max(1, Math.floor(Number(threshold) / 2) || 1)
          : 50000;
    if (staged.length > threshold) {
      let inserted = 0;
      let updated = 0;
      for (let i = 0; i < staged.length; i += batchSize) {
        const batch = staged.slice(i, i + batchSize);
        const batchIdx = Math.floor(i / batchSize);
        if (failAfterBatch != null && batchIdx === failAfterBatch) {
          leftoverStaging.length = 0;
          for (const s of staged.slice(0, i)) {
            leftoverStaging.push({
              Source: providerId,
              FeedKey: feedKey,
              MerchantProductId: String(s.MerchantProductId),
              Env: env,
              Title: s.title || '',
              ContentHash: s.ContentHash,
            });
          }
          const err = new Error('forced_batch_failure');
          err.code = 'sql_error';
          throw err;
        }
        for (const s of batch) {
          const k = partKey(providerId, feedKey, s.MerchantProductId);
          const prev = parts.get(k);
          const row = {
            Source: providerId,
            FeedKey: feedKey,
            MerchantProductId: String(s.MerchantProductId),
            Env: env,
            Class: className,
            Title: s.title || '',
            Description: s.description || '',
            Brand: s.brand || '',
            Category: s.category || '',
            Url: s.url || '',
            ImageUrl: s.image_url || '',
            Price: s.price,
            Currency: s.currency || '',
            Gtin: s.gtin || '',
            Ean: s.ean || '',
            Mpn: s.mpn || '',
            Availability: s.availability || '',
            ContentHash: s.ContentHash,
            DeletedAt: null,
            LastSeenRunId: runId,
          };
          if (!prev || prev.DeletedAt) inserted += 1;
          else if (prev.ContentHash !== s.ContentHash) updated += 1;
          parts.set(k, row);
        }
      }
      // deletes only after all batches succeed
      let deleted = 0;
      if (deleteMissing === 'soft' || deleteMissing === 'hard') {
        for (const a of listActive(providerId, feedKey)) {
          if (a.LastSeenRunId == null) continue;
          if (!stagedKeys.has(a.MerchantProductId)) {
            const k = partKey(providerId, feedKey, a.MerchantProductId);
            if (deleteMissing === 'hard') parts.delete(k);
            else {
              const cur = parts.get(k);
              parts.set(k, { ...cur, DeletedAt: new Date().toISOString() });
            }
            deleted += 1;
          }
        }
      }
      ftsPending = Math.max(0, staged.length);
      return { inserted, updated, deleted, wouldInsert, wouldUpdate, wouldDelete };
    }

    // single-transaction path
    const snapshot = new Map(parts);
    try {
      let inserted = 0;
      let updated = 0;
      for (const s of staged) {
        const k = partKey(providerId, feedKey, s.MerchantProductId);
        const prev = parts.get(k);
        const row = {
          Source: providerId,
          FeedKey: feedKey,
          MerchantProductId: String(s.MerchantProductId),
          Env: env,
          Class: className,
          Title: s.title || '',
          Description: s.description || '',
          Brand: s.brand || '',
          Category: s.category || '',
          Url: s.url || '',
          ImageUrl: s.image_url || '',
          Price: s.price,
          Currency: s.currency || '',
          Gtin: s.gtin || '',
          Ean: s.ean || '',
          Mpn: s.mpn || '',
          Availability: s.availability || '',
          ContentHash: s.ContentHash,
          DeletedAt: null,
          LastSeenRunId: runId,
        };
        if (!prev || prev.DeletedAt) inserted += 1;
        else if (prev.ContentHash !== s.ContentHash) updated += 1;
        parts.set(k, row);
      }
      let deleted = 0;
      if (deleteMissing === 'soft' || deleteMissing === 'hard') {
        for (const a of listActive(providerId, feedKey)) {
          if (a.LastSeenRunId == null) continue;
          if (!stagedKeys.has(a.MerchantProductId)) {
            const k = partKey(providerId, feedKey, a.MerchantProductId);
            if (deleteMissing === 'hard') parts.delete(k);
            else {
              const cur = parts.get(k);
              parts.set(k, { ...cur, DeletedAt: new Date().toISOString() });
            }
            deleted += 1;
          }
        }
      }
      ftsPending = Math.max(0, staged.length);
      return { inserted, updated, deleted, wouldInsert, wouldUpdate, wouldDelete };
    } catch (e) {
      parts.clear();
      for (const [k, v] of snapshot) parts.set(k, v);
      throw e;
    }
  }

  function hardPurge(providerId, feedKey) {
    let n = 0;
    for (const [k, row] of [...parts.entries()]) {
      if (row.Source === providerId && row.FeedKey === feedKey && row.Env === env) {
        parts.delete(k);
        n += 1;
      }
    }
    return n;
  }

  function markFileOk(fileKey, version, providerId, feedKey) {
    importFiles.set(`${fileKey}|${version}`, {
      FileKey: fileKey,
      Version: version,
      ProviderId: providerId,
      FeedKey: feedKey,
      Status: 'ok',
      OkAt: new Date().toISOString(),
    });
  }

  function isFileOk(fileKey, version) {
    const row = importFiles.get(`${fileKey}|${version}`);
    return !!(row && row.Status === 'ok');
  }

  function addFailure(row) {
    failureSeq += 1;
    const f = { FailureId: failureSeq, ...row };
    failures.push(f);
    return f;
  }

  async function drainLeftoverStaging() {
    const feeds = new Set(
      leftoverStaging.map((r) => `${r.Source}|${r.FeedKey}|${r.Env}`),
    );
    for (const row of leftoverStaging) {
      const k = partKey(row.Source, row.FeedKey, row.MerchantProductId);
      if (!parts.has(k)) {
        parts.set(k, {
          Source: row.Source,
          FeedKey: row.FeedKey,
          MerchantProductId: String(row.MerchantProductId),
          Env: row.Env || env,
          Title: row.Title || '',
          ContentHash: row.ContentHash || '',
          DeletedAt: null,
        });
      }
    }
    leftoverStaging.length = 0;
    return { feeds: feeds.size };
  }

  function endOfRunHealth() {
    if (leftoverStaging.length) {
      const err = new Error('staging_leftover');
      err.code = 'staging_leftover';
      throw err;
    }
    const rebuilt = [];
    for (const name of [...indexesDisabled]) {
      indexesDisabled.delete(name);
      rebuilt.push(name);
    }
    if (!ftsEnabled) {
      const err = new Error('fts_disabled');
      err.code = 'fts_failed';
      throw err;
    }
    ftsPending = 0;
    return { rebuilt, ftsPending: 0 };
  }

  function containstableProbe(providerId, feedKey, token) {
    const t = String(token || '').toLowerCase();
    for (const row of listActive(providerId, feedKey)) {
      if (String(row.Title || '').toLowerCase().includes(t)) return true;
    }
    return false;
  }

  function disableIndex(name) {
    indexesDisabled.add(name);
  }

  return {
    env,
    leftoverStaging,
    parts,
    importFiles,
    failures,
    rejects,
    purgeRequests,
    runFeeds,
    beginRun,
    tryAppLock,
    releaseAppLock,
    forceHoldAppLock,
    listActive,
    seedPart,
    mergeFeed,
    hardPurge,
    markFileOk,
    isFileOk,
    addFailure,
    drainLeftoverStaging,
    endOfRunHealth,
    containstableProbe,
    disableIndex,
    get disabledIndexes() {
      return indexesDisabled;
    },
    get ftsEnabled() {
      return ftsEnabled;
    },
    set ftsEnabled(v) {
      ftsEnabled = !!v;
    },
  };
}

module.exports = { createMemoryStore };
