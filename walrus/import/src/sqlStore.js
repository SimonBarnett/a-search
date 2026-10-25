'use strict';

/**
 * FR #4520: mssql-backed Parts + ingest.* store for walrus daily import.
 * Same surface as memoryStore; unit tests inject `exec`.
 * Never writes madeiradb (assertWritableDatabase).
 */

const { assertWritableDatabase } = require('../../src/dbWriterGuard');
const { applyTrustedMssqlOdbc } = require('../../../shared/mssql/trustedOdbc');

class SqlStoreConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SqlStoreConfigError';
    this.code = 'sql_config';
  }
}

/**
 * @param {Record<string, string|undefined>} envVars
 */
function mssqlConfigFromEnv(envVars) {
  const env = envVars || process.env;
  const server = String(env.MSSQL_SERVER || '').trim();
  const database = String(env.MSSQL_DATABASE || '').trim();
  if (!server || !database) {
    throw new SqlStoreConfigError('MSSQL_SERVER and MSSQL_DATABASE are required');
  }
  assertWritableDatabase(database);

  const trusted = String(env.MSSQL_TRUSTED_CONNECTION || '')
    .trim()
    .toLowerCase();
  const useTrusted = trusted === 'true' || trusted === '1' || trusted === 'yes';
  const user = String(env.MSSQL_USER || '').trim();
  const password = env.MSSQL_PASSWORD == null ? '' : String(env.MSSQL_PASSWORD);

  /** @type {any} */
  const cfg = {
    server,
    database,
    options: {
      encrypt: String(env.MSSQL_ENCRYPT || 'true').toLowerCase() !== 'false',
      trustServerCertificate:
        String(env.MSSQL_TRUST_SERVER_CERTIFICATE || 'true').toLowerCase() !== 'false',
      enableArithAbort: true,
    },
    requestTimeout: Number(env.MSSQL_REQUEST_TIMEOUT_MS || 600000) || 600000,
  };

  if (useTrusted) {
    // FR #4534 / #4548: msnodesqlv8 + ODBC Driver 17 (not Native Client 11.0 / NTLM).
    applyTrustedMssqlOdbc(cfg, env);
  } else {
    if (!user) {
      throw new SqlStoreConfigError(
        'MSSQL_USER is required unless MSSQL_TRUSTED_CONNECTION=true',
      );
    }
    cfg.user = user;
    cfg.password = password;
  }
  return cfg;
}

/**
 * @param {object} [opts]
 * @param {string} [opts.env] live|sandbox
 * @param {Record<string,string|undefined>} [opts.envVars]
 * @param {(sql: string, inputs?: object) => Promise<{recordset?: any[], rowsAffected?: number[]}>} [opts.exec]
 * @param {() => Promise<any>} [opts.connect]
 */
function createSqlStore(opts = {}) {
  const envVars = opts.envVars || process.env;
  const database = String(
    opts.database || envVars.MSSQL_DATABASE || 'a_search_sandbox',
  ).toLowerCase();
  assertWritableDatabase(database);
  const env =
    opts.env ||
    (database.includes('sandbox') ? 'sandbox' : 'live');

  const failures = [];
  const rejects = [];
  /** @type {object[]} */
  let purgeRequests = Array.isArray(opts.purgeRequests) ? [...opts.purgeRequests] : [];
  const runFeeds = [];
  let failureSeq = 0;
  let pool = null;
  let appLockHeld = false;

  const exec =
    typeof opts.exec === 'function'
      ? opts.exec
      : async (sqlText, inputs) => {
          if (!pool) {
            const cfg = mssqlConfigFromEnv(envVars);
            const mod =
              cfg.driver === 'msnodesqlv8' ? 'mssql/msnodesqlv8' : 'mssql';
            // eslint-disable-next-line global-require, import/no-dynamic-require
            const sql = require(mod);
            const connect =
              typeof opts.connect === 'function'
                ? opts.connect
                : async (c) => sql.connect(c);
            pool = await connect(cfg);
          }
          const req = pool.request();
          if (inputs && typeof inputs === 'object') {
            for (const [k, v] of Object.entries(inputs)) {
              req.input(k, v);
            }
          }
          return req.query(sqlText);
        };

  async function beginRun(mode) {
    const result = await exec(
      `INSERT INTO ingest.ImportRuns (Host, Mode, Status)
       OUTPUT INSERTED.RunId
       VALUES (@Host, @Mode, N'running');`,
      {
        Host: String(opts.host || require('node:os').hostname()).slice(0, 128),
        Mode: mode || 'run',
      },
    );
    const runId = result.recordset && result.recordset[0] && result.recordset[0].RunId;
    return {
      runId: Number(runId),
      mode: mode || 'run',
      startedAt: new Date().toISOString(),
      status: 'running',
      exitCode: null,
    };
  }

  async function tryAppLock() {
    if (appLockHeld) return false;
    const result = await exec(
      `DECLARE @r int;
       EXEC @r = sp_getapplock
         @Resource = N'a-search-daily-import',
         @LockMode = N'Exclusive',
         @LockOwner = N'Session',
         @LockTimeout = 0;
       SELECT @r AS LockResult;`,
    );
    const code =
      result.recordset && result.recordset[0] && Number(result.recordset[0].LockResult);
    if (code === 0 || code === 1) {
      appLockHeld = true;
      return true;
    }
    return false;
  }

  async function releaseAppLock() {
    if (!appLockHeld) return;
    try {
      await exec(
        `EXEC sp_releaseapplock @Resource = N'a-search-daily-import', @LockOwner = N'Session';`,
      );
    } catch {
      // session end also releases
    }
    appLockHeld = false;
  }

  async function listActive(source, feedKey) {
    const result = await exec(
      `SELECT Source, FeedKey, MerchantProductId, Env, Class, Title, Description,
              Brand, Category, Url, ImageUrl, Price, Currency, Gtin, Ean, Mpn,
              Availability, ContentHash, DeletedAt, LastSeenRunId
       FROM dbo.Parts
       WHERE Source = @Source AND FeedKey = @FeedKey AND Env = @Env
         AND DeletedAt IS NULL;`,
      { Source: source, FeedKey: feedKey, Env: env },
    );
    return (result.recordset || []).map((row) => ({
      ...row,
      MerchantProductId: String(row.MerchantProductId),
    }));
  }

  async function mergeFeed(mergeOpts) {
    const {
      runId,
      providerId,
      feedKey,
      className,
      staged,
      deleteMissing,
      dryRun,
    } = mergeOpts;

    const active = await listActive(providerId, feedKey);
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

    // Clear this run's staging slice then load rows (ingest.* per FR #4520)
    await exec(
      `DELETE FROM ingest.PartsStaging
       WHERE RunId = @RunId AND ProviderId = @ProviderId AND FeedKey = @FeedKey AND Env = @Env;`,
      { RunId: runId, ProviderId: providerId, FeedKey: feedKey, Env: env },
    );

    const batchSize = Number(mergeOpts.batchSize) || 500;
    for (let i = 0; i < staged.length; i += batchSize) {
      const batch = staged.slice(i, i + batchSize);
      for (const s of batch) {
        await exec(
          `INSERT INTO ingest.PartsStaging (
             RunId, ProviderId, FeedKey, RowNum, MerchantProductId,
             Title, Description, Brand, Category, Price, Currency, Url, ImageUrl,
             Gtin, Ean, Mpn, Availability, Class, ContentHash, Env
           ) VALUES (
             @RunId, @ProviderId, @FeedKey, @RowNum, @MerchantProductId,
             @Title, @Description, @Brand, @Category, @Price, @Currency, @Url, @ImageUrl,
             @Gtin, @Ean, @Mpn, @Availability, @Class, @ContentHash, @Env
           );`,
          {
            RunId: runId,
            ProviderId: providerId,
            FeedKey: feedKey,
            RowNum: Number(s.rowNum) || i + 1,
            MerchantProductId: String(s.MerchantProductId),
            Title: s.title || null,
            Description: s.description || null,
            Brand: s.brand || null,
            Category: s.category || null,
            Price: s.price,
            Currency: s.currency || null,
            Url: s.url || null,
            ImageUrl: s.image_url || null,
            Gtin: s.gtin || null,
            Ean: s.ean || null,
            Mpn: s.mpn || null,
            Availability: s.availability || null,
            Class: className || null,
            ContentHash: s.ContentHash || null,
            Env: env,
          },
        );
      }
    }

    const mergeResult = await exec(
      `DECLARE @ins int = 0, @upd int = 0;
       MERGE dbo.Parts AS T
       USING (
         SELECT ProviderId AS Source, FeedKey, MerchantProductId, Env,
                Title, Description, Brand, Category, Url, ImageUrl, Price, Currency,
                Gtin, Ean, Mpn, Availability, Class, ContentHash, RunId
         FROM ingest.PartsStaging
         WHERE RunId = @RunId AND ProviderId = @ProviderId AND FeedKey = @FeedKey AND Env = @Env
       ) AS S
       ON T.Source = S.Source AND T.FeedKey = S.FeedKey
          AND T.MerchantProductId = S.MerchantProductId AND T.Env = S.Env
       WHEN MATCHED AND ISNULL(T.ContentHash, N'') <> ISNULL(S.ContentHash, N'') THEN UPDATE SET
         Title = S.Title, Description = S.Description, Brand = S.Brand, Category = S.Category,
         Url = S.Url, ImageUrl = S.ImageUrl, Price = S.Price, Currency = S.Currency,
         Gtin = S.Gtin, Ean = S.Ean, Mpn = S.Mpn, Availability = S.Availability,
         Class = S.Class, ContentHash = S.ContentHash, DeletedAt = NULL,
         LastSeenRunId = S.RunId, UpdatedAt = SYSUTCDATETIME()
       WHEN MATCHED THEN UPDATE SET
         DeletedAt = NULL, LastSeenRunId = S.RunId, UpdatedAt = SYSUTCDATETIME()
       WHEN NOT MATCHED BY TARGET THEN INSERT (
         Source, FeedKey, MerchantProductId, Env,
         Title, Description, Brand, Category, Url, ImageUrl, Price, Currency,
         Gtin, Ean, Mpn, Availability, Class, ContentHash, LastSeenRunId
       ) VALUES (
         S.Source, S.FeedKey, S.MerchantProductId, S.Env,
         S.Title, S.Description, S.Brand, S.Category, S.Url, S.ImageUrl, S.Price, S.Currency,
         S.Gtin, S.Ean, S.Mpn, S.Availability, S.Class, S.ContentHash, S.RunId
       );
       SELECT @ins = (
         SELECT COUNT(*) FROM ingest.PartsStaging st
         WHERE st.RunId = @RunId AND st.ProviderId = @ProviderId AND st.FeedKey = @FeedKey AND st.Env = @Env
           AND NOT EXISTS (
             SELECT 1 FROM dbo.Parts p
             WHERE p.Source = st.ProviderId AND p.FeedKey = st.FeedKey
               AND p.MerchantProductId = st.MerchantProductId AND p.Env = st.Env
               AND p.ContentHash = st.ContentHash AND p.DeletedAt IS NULL
               AND p.LastSeenRunId <> st.RunId
           )
       );
       SELECT @@ROWCOUNT AS MergeRows;`,
      { RunId: runId, ProviderId: providerId, FeedKey: feedKey, Env: env },
    );

    // Prefer computed would* from pre-merge snapshot for inserted/updated counts
    let inserted = wouldInsert;
    let updated = wouldUpdate;
    void mergeResult;

    let deleted = 0;
    if (deleteMissing === 'soft') {
      const del = await exec(
        `UPDATE T
         SET DeletedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
         FROM dbo.Parts AS T
         WHERE T.Source = @ProviderId AND T.FeedKey = @FeedKey AND T.Env = @Env
           AND T.DeletedAt IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM ingest.PartsStaging S
             WHERE S.RunId = @RunId AND S.ProviderId = T.Source AND S.FeedKey = T.FeedKey
               AND S.Env = T.Env AND S.MerchantProductId = T.MerchantProductId
           );
         SELECT @@ROWCOUNT AS Deleted;`,
        { RunId: runId, ProviderId: providerId, FeedKey: feedKey, Env: env },
      );
      deleted = Number(
        (del.recordset && del.recordset[0] && del.recordset[0].Deleted) || wouldDelete,
      );
    } else if (deleteMissing === 'hard') {
      const del = await exec(
        `DELETE T
         FROM dbo.Parts AS T
         WHERE T.Source = @ProviderId AND T.FeedKey = @FeedKey AND T.Env = @Env
           AND NOT EXISTS (
             SELECT 1 FROM ingest.PartsStaging S
             WHERE S.RunId = @RunId AND S.ProviderId = T.Source AND S.FeedKey = T.FeedKey
               AND S.Env = T.Env AND S.MerchantProductId = T.MerchantProductId
           );
         SELECT @@ROWCOUNT AS Deleted;`,
        { RunId: runId, ProviderId: providerId, FeedKey: feedKey, Env: env },
      );
      deleted = Number(
        (del.recordset && del.recordset[0] && del.recordset[0].Deleted) || wouldDelete,
      );
    }

    return {
      inserted,
      updated,
      deleted,
      wouldInsert,
      wouldUpdate,
      wouldDelete,
    };
  }

  async function hardPurge(providerId, feedKey) {
    const result = await exec(
      `DELETE FROM dbo.Parts
       WHERE Source = @ProviderId AND FeedKey = @FeedKey AND Env = @Env;
       SELECT @@ROWCOUNT AS N;`,
      { ProviderId: providerId, FeedKey: feedKey, Env: env },
    );
    return Number((result.recordset && result.recordset[0] && result.recordset[0].N) || 0);
  }

  async function markFileOk(fileKey, version, providerId, feedKey) {
    await exec(
      `MERGE ingest.ImportFiles AS T
       USING (SELECT @FileKey AS FileKey, @Version AS Version) AS S
       ON T.FileKey = S.FileKey AND T.Version = S.Version
       WHEN MATCHED THEN UPDATE SET Status = N'ok', OkAt = SYSUTCDATETIME(),
         ProviderId = @ProviderId, FeedKey = @FeedKey
       WHEN NOT MATCHED THEN INSERT (FileKey, Version, ProviderId, FeedKey, Status, OkAt)
         VALUES (@FileKey, @Version, @ProviderId, @FeedKey, N'ok', SYSUTCDATETIME());`,
      {
        FileKey: fileKey,
        Version: version,
        ProviderId: providerId,
        FeedKey: feedKey,
      },
    );
  }

  async function isFileOk(fileKey, version) {
    const result = await exec(
      `SELECT Status FROM ingest.ImportFiles
       WHERE FileKey = @FileKey AND Version = @Version;`,
      { FileKey: fileKey, Version: version },
    );
    const row = result.recordset && result.recordset[0];
    return !!(row && String(row.Status).toLowerCase() === 'ok');
  }

  async function addFailure(row) {
    failureSeq += 1;
    const f = { FailureId: failureSeq, ...row };
    failures.push(f);
    try {
      await exec(
        `INSERT INTO ingest.Failures (
           RunId, ProviderId, FeedKey, FileKey, ErrorCode, ErrorDetail,
           SampleBadRowsPath, ProviderJsonSha, AgentStatus, IssueUrl
         ) VALUES (
           @RunId, @ProviderId, @FeedKey, @FileKey, @ErrorCode, @ErrorDetail,
           @SampleBadRowsPath, @ProviderJsonSha, @AgentStatus, @IssueUrl
         );`,
        {
          RunId: row.RunId,
          ProviderId: row.ProviderId,
          FeedKey: row.FeedKey,
          FileKey: row.FileKey || null,
          ErrorCode: row.ErrorCode,
          ErrorDetail: row.ErrorDetail || null,
          SampleBadRowsPath: row.SampleBadRowsPath || null,
          ProviderJsonSha: row.ProviderJsonSha || null,
          AgentStatus: row.AgentStatus || null,
          IssueUrl: row.IssueUrl || null,
        },
      );
    } catch {
      // keep in-memory failure for agent stamp even if SQL insert fails mid-run
    }
    return f;
  }

  /** FR #4943: stamp IssueNumber / IssueUrl / AgentStatus on matching rows. */
  async function stampFailureIssue(patch) {
    const matches = failures.filter(
      (f) =>
        String(f.ProviderId) === String(patch.ProviderId) &&
        String(f.FeedKey) === String(patch.FeedKey) &&
        String(f.ErrorCode) === String(patch.ErrorCode) &&
        (patch.RunId == null || Number(f.RunId) === Number(patch.RunId)),
    );
    for (const f of matches) {
      if (patch.IssueNumber != null) f.IssueNumber = patch.IssueNumber;
      if (patch.IssueUrl) f.IssueUrl = patch.IssueUrl;
      if (patch.AgentStatus) f.AgentStatus = patch.AgentStatus;
    }
    try {
      await exec(
        `UPDATE ingest.Failures
         SET IssueUrl = COALESCE(@IssueUrl, IssueUrl),
             IssueNumber = COALESCE(@IssueNumber, IssueNumber),
             AgentStatus = COALESCE(@AgentStatus, AgentStatus)
         WHERE RunId = @RunId
           AND ProviderId = @ProviderId
           AND FeedKey = @FeedKey
           AND ErrorCode = @ErrorCode;`,
        {
          RunId: patch.RunId,
          ProviderId: patch.ProviderId,
          FeedKey: patch.FeedKey,
          ErrorCode: patch.ErrorCode,
          IssueUrl: patch.IssueUrl || null,
          IssueNumber: patch.IssueNumber != null ? patch.IssueNumber : null,
          AgentStatus: patch.AgentStatus || null,
        },
      );
    } catch {
      // column may be missing pre-migration; in-memory stamp still applies
    }
    return matches.length;
  }

  /** FR #4943: leftover staging after merge (ingest + dbo). */
  async function countStagingLeftovers(runId) {
    const feeds = [];
    let count = 0;
    try {
      const result = await exec(
        `SELECT ProviderId, FeedKey, COUNT(*) AS Cnt
         FROM ingest.PartsStaging
         GROUP BY ProviderId, FeedKey;`,
      );
      for (const row of result.recordset || []) {
        const c = Number(row.Cnt) || 0;
        count += c;
        feeds.push({
          provider: row.ProviderId,
          feedKey: row.FeedKey,
          count: c,
          runId,
        });
      }
    } catch {
      // table may not exist in older DBs
    }
    try {
      const result = await exec(
        `SELECT COUNT(*) AS Cnt FROM dbo.PartsStaging;`,
      );
      const c = Number(result.recordset && result.recordset[0] && result.recordset[0].Cnt) || 0;
      if (c > 0) {
        count += c;
        feeds.push({ provider: '_dbo', feedKey: '_PartsStaging', count: c, runId });
      }
    } catch {
      // optional
    }
    return { count, feeds };
  }

  async function endOfRunHealth() {
    // FTS rebuild is ops-owned; import only probes after merge via containstableProbe.
    return { rebuilt: [], ftsPending: 0 };
  }

  async function containstableProbe(providerId, feedKey, token) {
    const t = String(token || '').trim();
    if (!t) return true;
    try {
      const result = await exec(
        `SELECT TOP 1 1 AS Hit
         FROM dbo.Parts
         WHERE Source = @ProviderId AND FeedKey = @FeedKey AND Env = @Env
           AND DeletedAt IS NULL
           AND Title LIKE @Like;`,
        {
          ProviderId: providerId,
          FeedKey: feedKey,
          Env: env,
          Like: `%${t.replace(/[%_[\]]/g, '')}%`,
        },
      );
      return !!(result.recordset && result.recordset.length);
    } catch {
      return false;
    }
  }

  async function loadPurgeRequests() {
    const result = await exec(
      `SELECT ProviderId, FeedKey, Reason, RequestedAt, ProcessedRunId
       FROM ingest.PurgeRequests
       WHERE ProcessedRunId IS NULL;`,
    );
    purgeRequests = (result.recordset || []).map((r) => ({ ...r }));
    return purgeRequests;
  }

  async function close() {
    if (pool && typeof pool.close === 'function') {
      await Promise.resolve(pool.close()).catch(() => {});
    }
    pool = null;
  }

  return {
    env,
    failures,
    rejects,
    runFeeds,
    get purgeRequests() {
      return purgeRequests;
    },
    set purgeRequests(v) {
      purgeRequests = Array.isArray(v) ? v : [];
    },
    beginRun,
    tryAppLock,
    releaseAppLock,
    listActive,
    mergeFeed,
    hardPurge,
    markFileOk,
    isFileOk,
    addFailure,
    stampFailureIssue,
    countStagingLeftovers,
    endOfRunHealth,
    containstableProbe,
    loadPurgeRequests,
    close,
    mssqlConfigFromEnv,
  };
}

module.exports = {
  createSqlStore,
  mssqlConfigFromEnv,
  SqlStoreConfigError,
};
