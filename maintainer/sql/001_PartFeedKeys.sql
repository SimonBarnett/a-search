-- FR-011: PartFeedKeys control table (migrate-once, IF NOT EXISTS)
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.PartFeedKeys', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PartFeedKeys (
    Source           nvarchar(64)  NOT NULL,
    FeedKey          nvarchar(128) NOT NULL,
    Env              nvarchar(16)  NOT NULL,
    FeedUrl          nvarchar(2048) NULL,
    ETag             nvarchar(256) NULL,
    LastModified     datetime2(3)  NULL,
    ContentHash      nvarchar(128) NULL,
    LastChecked      datetime2(3)  NULL,
    NextCheck        datetime2(3)  NULL,
    LastError        nvarchar(max) NULL,
    CreatedAt        datetime2(3)  NOT NULL
      CONSTRAINT DF_PartFeedKeys_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt        datetime2(3)  NOT NULL
      CONSTRAINT DF_PartFeedKeys_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT CK_PartFeedKeys_Env CHECK (Env IN (N'live', N'sandbox')),
    CONSTRAINT PK_PartFeedKeys PRIMARY KEY CLUSTERED (Source, FeedKey, Env)
  );
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_PartFeedKeys_Env_NextCheck'
    AND object_id = OBJECT_ID(N'dbo.PartFeedKeys')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_PartFeedKeys_Env_NextCheck
    ON dbo.PartFeedKeys (Env, NextCheck)
    INCLUDE (Source, FeedKey, LastChecked);
END
GO
