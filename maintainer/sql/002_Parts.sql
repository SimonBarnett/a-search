-- FR-011: Parts table for local search (migrate-once, IF NOT EXISTS)
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.Parts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Parts (
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
    DeletedAt           datetime2(3)   NULL,
    CreatedAt           datetime2(3)   NOT NULL
      CONSTRAINT DF_Parts_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt           datetime2(3)   NOT NULL
      CONSTRAINT DF_Parts_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT CK_Parts_Env CHECK (Env IN (N'live', N'sandbox')),
    CONSTRAINT PK_Parts PRIMARY KEY CLUSTERED
      (Source, FeedKey, MerchantProductId, Env)
  );
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_Parts_Env_Source_DeletedAt'
    AND object_id = OBJECT_ID(N'dbo.Parts')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Parts_Env_Source_DeletedAt
    ON dbo.Parts (Env, Source, DeletedAt)
    INCLUDE (FeedKey, MerchantProductId, Title, Price);
END
GO
