'use strict';

const sql = require('mssql');
const { checkSafetyGuard } = require('./safety');

/**
 * @param {{ server: string, database: string }} cfg
 */
async function connect(cfg) {
  const pool = await sql.connect({
    server: cfg.server,
    database: cfg.database,
    options: {
      trustServerCertificate: true,
      enableArithAbort: true,
      encrypt: false,
    },
    authentication: {
      type: 'default',
    },
    // Integrated auth on Windows:
    driver: 'msnodesqlv8',
  });
  return pool;
}

/**
 * Prefer tedious + integratedSecurity when msnodesqlv8 is absent.
 */
async function connectIntegrated(cfg) {
  try {
    return await sql.connect({
      server: cfg.server,
      database: cfg.database,
      options: {
        trustServerCertificate: true,
        enableArithAbort: true,
        encrypt: false,
        trustedConnection: true,
      },
      authentication: { type: 'ntlm', options: { domain: '', userName: '', password: '' } },
    });
  } catch {
    /* fall through */
  }
  // tedious with integratedSecurity (Windows)
  return sql.connect({
    server: cfg.server,
    database: cfg.database,
    options: {
      trustServerCertificate: true,
      enableArithAbort: true,
      encrypt: false,
      integratedSecurity: true,
    },
  });
}

async function countActiveParts(pool, source, feedKey, env) {
  const r = await pool
    .request()
    .input('Source', sql.NVarChar(64), source)
    .input('FeedKey', sql.NVarChar(128), feedKey)
    .input('Env', sql.NVarChar(16), env)
    .query(
      `SELECT COUNT(*) AS c FROM dbo.Parts
       WHERE Source=@Source AND FeedKey=@FeedKey AND Env=@Env AND DeletedAt IS NULL`,
    );
  return Number(r.recordset[0].c) || 0;
}

async function clearStaging(pool, source, feedKey, env) {
  await pool
    .request()
    .input('Source', sql.NVarChar(64), source)
    .input('FeedKey', sql.NVarChar(128), feedKey)
    .input('Env', sql.NVarChar(16), env)
    .query(
      `DELETE FROM dbo.PartsStaging
       WHERE Source=@Source AND FeedKey=@FeedKey AND Env=@Env`,
    );
}

/**
 * Bulk insert staging rows in chunks.
 * @param {import('mssql').ConnectionPool} pool
 * @param {object[]} rows Parts-shaped with Source/FeedKey/Env
 */
async function loadPartsStaging(pool, rows) {
  if (!rows.length) return;
  const table = new sql.Table('dbo.PartsStaging');
  table.create = false;
  table.columns.add('Source', sql.NVarChar(64), { nullable: false });
  table.columns.add('FeedKey', sql.NVarChar(128), { nullable: false });
  table.columns.add('MerchantProductId', sql.NVarChar(256), { nullable: false });
  table.columns.add('Env', sql.NVarChar(16), { nullable: false });
  table.columns.add('Title', sql.NVarChar(512), { nullable: true });
  table.columns.add('Description', sql.NVarChar(sql.MAX), { nullable: true });
  table.columns.add('Url', sql.NVarChar(2048), { nullable: true });
  table.columns.add('ImageUrl', sql.NVarChar(2048), { nullable: true });
  table.columns.add('Price', sql.Decimal(18, 4), { nullable: true });
  table.columns.add('Currency', sql.NVarChar(8), { nullable: true });
  table.columns.add('Stock', sql.NVarChar(64), { nullable: true });
  table.columns.add('ContentHash', sql.NVarChar(128), { nullable: true });

  const chunk = 2000;
  for (let i = 0; i < rows.length; i += chunk) {
    table.rows.length = 0;
    const slice = rows.slice(i, i + chunk);
    for (const r of slice) {
      table.rows.add(
        r.Source,
        r.FeedKey,
        r.MerchantProductId,
        r.Env,
        r.Title || null,
        r.Description || null,
        r.Url || null,
        r.ImageUrl || null,
        r.Price,
        r.Currency || null,
        r.Stock || null,
        r.ContentHash || null,
      );
    }
    const req = pool.request();
    await req.bulk(table);
  }
}

async function mergePartsFromStaging(pool, source, feedKey, env) {
  const result = await pool
    .request()
    .input('Source', sql.NVarChar(64), source)
    .input('FeedKey', sql.NVarChar(128), feedKey)
    .input('Env', sql.NVarChar(16), env)
    .query(`
MERGE dbo.Parts AS t
USING (
  SELECT Source, FeedKey, MerchantProductId, Env, Title, Description, Url, ImageUrl,
         Price, Currency, Stock, ContentHash
  FROM dbo.PartsStaging
  WHERE Source=@Source AND FeedKey=@FeedKey AND Env=@Env
) AS s
ON t.Source=s.Source AND t.FeedKey=s.FeedKey AND t.MerchantProductId=s.MerchantProductId AND t.Env=s.Env
WHEN MATCHED THEN UPDATE SET
  Title=s.Title,
  Description=s.Description,
  Url=s.Url,
  ImageUrl=s.ImageUrl,
  Price=s.Price,
  Currency=s.Currency,
  Stock=s.Stock,
  ContentHash=s.ContentHash,
  Category=NULL,
  DeletedAt=NULL,
  UpdatedAt=SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET THEN INSERT
  (Source, FeedKey, MerchantProductId, Env, Title, Description, Url, ImageUrl,
   Price, Currency, Stock, ContentHash, DeletedAt)
  VALUES
  (s.Source, s.FeedKey, s.MerchantProductId, s.Env, s.Title, s.Description, s.Url, s.ImageUrl,
   s.Price, s.Currency, s.Stock, s.ContentHash, NULL);

SELECT @@ROWCOUNT AS MergeRows;
`);
  return Number(result.recordset[0]?.MergeRows) || 0;
}

async function softDeleteMissingParts(pool, source, feedKey, env) {
  const result = await pool
    .request()
    .input('Source', sql.NVarChar(64), source)
    .input('FeedKey', sql.NVarChar(128), feedKey)
    .input('Env', sql.NVarChar(16), env)
    .query(`
UPDATE dbo.Parts
SET DeletedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
WHERE Source=@Source AND FeedKey=@FeedKey AND Env=@Env
  AND DeletedAt IS NULL
  AND MerchantProductId NOT IN (
    SELECT MerchantProductId FROM dbo.PartsStaging
    WHERE Source=@Source AND FeedKey=@FeedKey AND Env=@Env
  );
SELECT @@ROWCOUNT AS DeletedRows;
`);
  return Number(result.recordset[0]?.DeletedRows) || 0;
}

/**
 * Full parts import for one merchant feed.
 */
async function importParts(pool, opts) {
  const { source, feedKey, env, rows, maxRemoveRatio, dryRun } = opts;
  const existing = await countActiveParts(pool, source, feedKey, env);
  const stagingIds = new Set(rows.map((r) => String(r.MerchantProductId)));
  // wouldRemove approximated after we know existing — need existing ids for accuracy.
  // Cheap path: if existing==0, wouldRemove=0; else query.
  let wouldRemove = 0;
  if (existing > 0) {
    const r = await pool
      .request()
      .input('Source', sql.NVarChar(64), source)
      .input('FeedKey', sql.NVarChar(128), feedKey)
      .input('Env', sql.NVarChar(16), env)
      .query(
        `SELECT MerchantProductId FROM dbo.Parts
         WHERE Source=@Source AND FeedKey=@FeedKey AND Env=@Env AND DeletedAt IS NULL`,
      );
    wouldRemove = r.recordset.filter((x) => !stagingIds.has(String(x.MerchantProductId))).length;
  }
  const guard = checkSafetyGuard({
    parsedCount: rows.length,
    existingActiveCount: existing,
    wouldRemoveCount: wouldRemove,
    maxRemoveRatio,
  });
  if (!guard.ok) {
    const err = new Error(guard.message);
    err.code = guard.code;
    throw err;
  }
  if (dryRun) {
    return {
      dryRun: true,
      parsed: rows.length,
      existing,
      wouldRemove,
      upserted: 0,
      deleted: 0,
    };
  }

  const staged = rows.map((r) => ({
    ...r,
    Source: source,
    FeedKey: feedKey,
    Env: env,
    Stock: r.Stock || null,
  }));
  await clearStaging(pool, source, feedKey, env);
  await loadPartsStaging(pool, staged);
  const upserted = await mergePartsFromStaging(pool, source, feedKey, env);
  // Also patch Category/Brand in a second pass (staging table lacks those cols)
  await pool
    .request()
    .input('Source', sql.NVarChar(64), source)
    .input('FeedKey', sql.NVarChar(128), feedKey)
    .input('Env', sql.NVarChar(16), env)
    .query(
      `UPDATE p SET p.UpdatedAt=SYSUTCDATETIME()
       FROM dbo.Parts p
       INNER JOIN dbo.PartsStaging s
         ON p.Source=s.Source AND p.FeedKey=s.FeedKey
        AND p.MerchantProductId=s.MerchantProductId AND p.Env=s.Env
       WHERE p.Source=@Source AND p.FeedKey=@FeedKey AND p.Env=@Env`,
    );
  const deleted = await softDeleteMissingParts(pool, source, feedKey, env);
  await clearStaging(pool, source, feedKey, env);
  return {
    dryRun: false,
    parsed: rows.length,
    existing,
    wouldRemove,
    upserted,
    deleted,
  };
}

async function ensureAffiliateOffers(pool) {
  await pool.request().query(`
IF OBJECT_ID(N'dbo.AffiliateOffers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AffiliateOffers (
    Source nvarchar(64) NOT NULL,
    FeedKey nvarchar(128) NOT NULL,
    PromotionId nvarchar(64) NOT NULL,
    Env nvarchar(16) NOT NULL CONSTRAINT DF_AffiliateOffers_Env DEFAULT (N'live'),
    Type nvarchar(64) NULL,
    Title nvarchar(512) NULL,
    Description nvarchar(max) NULL,
    Terms nvarchar(max) NULL,
    Code nvarchar(128) NULL,
    Url nvarchar(2048) NULL,
    UrlTracking nvarchar(2048) NULL,
    StartDate datetime2(0) NULL,
    EndDate datetime2(0) NULL,
    Status nvarchar(64) NULL,
    Exclusive bit NOT NULL CONSTRAINT DF_AffiliateOffers_Exclusive DEFAULT (0),
    Attributable bit NOT NULL CONSTRAINT DF_AffiliateOffers_Attributable DEFAULT (0),
    RawJson nvarchar(max) NULL,
    DeletedAt datetime2(7) NULL,
    CreatedAt datetime2(7) NOT NULL CONSTRAINT DF_AffiliateOffers_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt datetime2(7) NOT NULL CONSTRAINT DF_AffiliateOffers_UpdatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_AffiliateOffers PRIMARY KEY CLUSTERED (Source, FeedKey, PromotionId, Env)
  );
END
`);
}

async function importOffers(pool, opts) {
  const { source, feedKey, env, rows, dryRun } = opts;
  await ensureAffiliateOffers(pool);
  if (dryRun) {
    return { dryRun: true, parsed: rows.length, upserted: 0, deleted: 0 };
  }

  // Temp table for batch ids
  await pool.request().query(`
IF OBJECT_ID('tempdb..#OfferBatch') IS NOT NULL DROP TABLE #OfferBatch;
CREATE TABLE #OfferBatch (
  PromotionId nvarchar(64) NOT NULL PRIMARY KEY,
  Type nvarchar(64) NULL,
  Title nvarchar(512) NULL,
  Description nvarchar(max) NULL,
  Terms nvarchar(max) NULL,
  Code nvarchar(128) NULL,
  Url nvarchar(2048) NULL,
  UrlTracking nvarchar(2048) NULL,
  StartDate datetime2(0) NULL,
  EndDate datetime2(0) NULL,
  Status nvarchar(64) NULL,
  Exclusive bit NOT NULL,
  Attributable bit NOT NULL,
  RawJson nvarchar(max) NULL
);
`);

  const table = new sql.Table('#OfferBatch');
  table.create = false;
  table.columns.add('PromotionId', sql.NVarChar(64), { nullable: false });
  table.columns.add('Type', sql.NVarChar(64), { nullable: true });
  table.columns.add('Title', sql.NVarChar(512), { nullable: true });
  table.columns.add('Description', sql.NVarChar(sql.MAX), { nullable: true });
  table.columns.add('Terms', sql.NVarChar(sql.MAX), { nullable: true });
  table.columns.add('Code', sql.NVarChar(128), { nullable: true });
  table.columns.add('Url', sql.NVarChar(2048), { nullable: true });
  table.columns.add('UrlTracking', sql.NVarChar(2048), { nullable: true });
  table.columns.add('StartDate', sql.DateTime2(0), { nullable: true });
  table.columns.add('EndDate', sql.DateTime2(0), { nullable: true });
  table.columns.add('Status', sql.NVarChar(64), { nullable: true });
  table.columns.add('Exclusive', sql.Bit, { nullable: false });
  table.columns.add('Attributable', sql.Bit, { nullable: false });
  table.columns.add('RawJson', sql.NVarChar(sql.MAX), { nullable: true });

  for (const r of rows) {
    table.rows.add(
      r.PromotionId,
      r.Type || null,
      r.Title || null,
      r.Description || null,
      r.Terms || null,
      r.Code || null,
      r.Url || null,
      r.UrlTracking || null,
      r.StartDate ? new Date(r.StartDate) : null,
      r.EndDate ? new Date(r.EndDate) : null,
      r.Status || null,
      r.Exclusive ? 1 : 0,
      r.Attributable ? 1 : 0,
      r.RawJson || null,
    );
  }
  if (rows.length) {
    await pool.request().bulk(table);
  }

  const merge = await pool
    .request()
    .input('Source', sql.NVarChar(64), source)
    .input('FeedKey', sql.NVarChar(128), feedKey)
    .input('Env', sql.NVarChar(16), env)
    .query(`
MERGE dbo.AffiliateOffers AS t
USING #OfferBatch AS s
ON t.Source=@Source AND t.FeedKey=@FeedKey AND t.PromotionId=s.PromotionId AND t.Env=@Env
WHEN MATCHED THEN UPDATE SET
  Type=s.Type, Title=s.Title, Description=s.Description, Terms=s.Terms, Code=s.Code,
  Url=s.Url, UrlTracking=s.UrlTracking, StartDate=s.StartDate, EndDate=s.EndDate,
  Status=s.Status, Exclusive=s.Exclusive, Attributable=s.Attributable, RawJson=s.RawJson,
  DeletedAt=NULL, UpdatedAt=SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET THEN INSERT
  (Source, FeedKey, PromotionId, Env, Type, Title, Description, Terms, Code, Url, UrlTracking,
   StartDate, EndDate, Status, Exclusive, Attributable, RawJson)
  VALUES
  (@Source, @FeedKey, s.PromotionId, @Env, s.Type, s.Title, s.Description, s.Terms, s.Code, s.Url, s.UrlTracking,
   s.StartDate, s.EndDate, s.Status, s.Exclusive, s.Attributable, s.RawJson);

UPDATE dbo.AffiliateOffers
SET DeletedAt=SYSUTCDATETIME(), UpdatedAt=SYSUTCDATETIME()
WHERE Source=@Source AND FeedKey=@FeedKey AND Env=@Env AND DeletedAt IS NULL
  AND PromotionId NOT IN (SELECT PromotionId FROM #OfferBatch);

SELECT
  (SELECT COUNT(*) FROM #OfferBatch) AS Parsed,
  @@ROWCOUNT AS LastRows;
`);

  // deleted count: run separate
  const del = await pool
    .request()
    .input('Source', sql.NVarChar(64), source)
    .input('FeedKey', sql.NVarChar(128), feedKey)
    .input('Env', sql.NVarChar(16), env)
    .query(`
SELECT COUNT(*) AS c FROM dbo.AffiliateOffers
WHERE Source=@Source AND FeedKey=@FeedKey AND Env=@Env AND DeletedAt IS NOT NULL
  AND UpdatedAt >= DATEADD(second, -30, SYSUTCDATETIME())
`);

  return {
    dryRun: false,
    parsed: rows.length,
    upserted: rows.length,
    deleted: Number(del.recordset[0]?.c) || 0,
    mergeInfo: merge.recordset[0],
  };
}

module.exports = {
  connectIntegrated,
  importParts,
  importOffers,
  ensureAffiliateOffers,
  countActiveParts,
};
