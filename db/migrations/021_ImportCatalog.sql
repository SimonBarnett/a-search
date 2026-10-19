-- target: a_search
-- FR #4463: ImportProviders / ImportFeeds catalog (daily import)
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.ImportProviders', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ImportProviders (
    ProviderId       nvarchar(64)  NOT NULL,
    Class            nvarchar(16)  NOT NULL,
    Enabled          bit           NOT NULL CONSTRAINT DF_ImportProviders_Enabled DEFAULT (1),
    ConfigSha256     nvarchar(64)  NULL,
    ConfigVersion    int           NULL,
    LastGoodRunId    bigint        NULL,
    UpdatedAt        datetime2(3)  NOT NULL CONSTRAINT DF_ImportProviders_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_ImportProviders PRIMARY KEY CLUSTERED (ProviderId),
    CONSTRAINT CK_ImportProviders_Class CHECK (Class IN (N'affiliate', N'merchant'))
  );
END
GO

IF OBJECT_ID(N'dbo.ImportFeeds', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ImportFeeds (
    ProviderId       nvarchar(64)  NOT NULL,
    FeedKey          nvarchar(128) NOT NULL,
    Class            nvarchar(16)  NOT NULL,
    Status           nvarchar(32)  NOT NULL CONSTRAINT DF_ImportFeeds_Status DEFAULT (N'ok'),
    LastGoodRunId    bigint        NULL,
    LastGoodRowCount int           NULL,
    LastFileKey      nvarchar(512) NULL,
    LastVersion      nvarchar(128) NULL,
    UpdatedAt        datetime2(3)  NOT NULL CONSTRAINT DF_ImportFeeds_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_ImportFeeds PRIMARY KEY CLUSTERED (ProviderId, FeedKey),
    CONSTRAINT CK_ImportFeeds_Class CHECK (Class IN (N'affiliate', N'merchant')),
    CONSTRAINT CK_ImportFeeds_Status CHECK (Status IN (N'ok', N'failed', N'needs_fix', N'purged'))
  );
END
GO
