-- FR #4196: idempotent affiliate import log (key + ETag) in a-search DB.
-- Replay of the same message after a commit is a no-op.
IF OBJECT_ID(N'dbo.AffiliateImportLog', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AffiliateImportLog (
    ImportLogId   BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Provider      NVARCHAR(64)  NOT NULL,
    AffiliateId   NVARCHAR(128) NOT NULL,
    ObjectKey     NVARCHAR(512) NOT NULL,
    ETag          NVARCHAR(128) NOT NULL,
    Status        NVARCHAR(32)  NOT NULL CONSTRAINT DF_AffiliateImportLog_Status DEFAULT (N'ok'),
    ImportedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_AffiliateImportLog_ImportedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_AffiliateImportLog_KeyETag UNIQUE (ObjectKey, ETag)
  );
  CREATE INDEX IX_AffiliateImportLog_ProviderAffiliate
    ON dbo.AffiliateImportLog (Provider, AffiliateId, ImportedAt DESC);
END
GO
