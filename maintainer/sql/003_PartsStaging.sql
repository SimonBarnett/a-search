-- FR-011: PartsStaging for bulk MERGE (migrate-once, IF NOT EXISTS)
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.PartsStaging', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PartsStaging (
    Source              nvarchar(64)   NOT NULL,
    FeedKey             nvarchar(128)  NOT NULL,
    MerchantProductId   nvarchar(256)  NOT NULL,
    Env                 nvarchar(16)   NOT NULL,
    Title               nvarchar(512)  NULL,
    Description         nvarchar(max)  NULL,
    Url                 nvarchar(2048) NULL,
    ImageUrl            nvarchar(2048) NULL,
    Price               decimal(18, 4) NULL,
    Currency            nvarchar(8)    NULL,
    Stock               nvarchar(64)   NULL,
    ContentHash         nvarchar(128)  NULL,
    LoadedAt            datetime2(3)   NOT NULL
      CONSTRAINT DF_PartsStaging_LoadedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT CK_PartsStaging_Env CHECK (Env IN (N'live', N'sandbox')),
    CONSTRAINT PK_PartsStaging PRIMARY KEY CLUSTERED
      (Source, FeedKey, MerchantProductId, Env)
  );
END
GO
