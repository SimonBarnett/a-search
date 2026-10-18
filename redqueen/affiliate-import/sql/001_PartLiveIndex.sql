-- FR #4001: map affiliate part keys to a-clubs host/guid for live.json prune
-- Database: asearch on walrus. Never apply to madeiradb.
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.PartLiveIndex', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PartLiveIndex (
    Source              nvarchar(64)   NOT NULL,
    FeedKey             nvarchar(128)  NOT NULL,
    MerchantProductId   nvarchar(256)  NOT NULL,
    HostKey             nvarchar(256)  NOT NULL,
    WidgetGuid          char(36)       NOT NULL,
    CreatedAt           datetime2(3)   NOT NULL
      CONSTRAINT DF_PartLiveIndex_CreatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_PartLiveIndex PRIMARY KEY CLUSTERED
      (Source, FeedKey, MerchantProductId, HostKey, WidgetGuid)
  );
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_PartLiveIndex_Host_Guid'
    AND object_id = OBJECT_ID(N'dbo.PartLiveIndex')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_PartLiveIndex_Host_Guid
    ON dbo.PartLiveIndex (HostKey, WidgetGuid)
    INCLUDE (Source, FeedKey, MerchantProductId);
END
GO
