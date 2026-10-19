-- target: a_search
-- FR #4463: ingest.* tables for daily import watermark, staging, rejects, failures, purge
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'ingest')
BEGIN
  EXEC(N'CREATE SCHEMA ingest');
END
GO

IF OBJECT_ID(N'ingest.ImportRuns', N'U') IS NULL
BEGIN
  CREATE TABLE ingest.ImportRuns (
    RunId      bigint         NOT NULL IDENTITY(1,1),
    StartedAt  datetime2(3)   NOT NULL CONSTRAINT DF_ImportRuns_StartedAt DEFAULT (sysutcdatetime()),
    EndedAt    datetime2(3)   NULL,
    Host       nvarchar(128)  NULL,
    GitSha     nvarchar(64)   NULL,
    Mode       nvarchar(16)   NOT NULL,
    Status     nvarchar(32)   NOT NULL,
    ExitCode   int            NULL,
    CONSTRAINT PK_ImportRuns PRIMARY KEY CLUSTERED (RunId),
    CONSTRAINT CK_ImportRuns_Mode CHECK (Mode IN (N'run', N'dry-run', N'provider'))
  );
END
GO

IF OBJECT_ID(N'ingest.ImportRunFeeds', N'U') IS NULL
BEGIN
  CREATE TABLE ingest.ImportRunFeeds (
    RunId            bigint         NOT NULL,
    ProviderId       nvarchar(64)   NOT NULL,
    FeedKey          nvarchar(128)  NOT NULL,
    FileKey          nvarchar(512)  NULL,
    Version          nvarchar(128)  NULL,
    Status           nvarchar(32)   NOT NULL,
    RowsRead         int            NULL,
    RowsStaged       int            NULL,
    RowsRejected     int            NULL,
    RowsInserted     int            NULL,
    RowsUpdated      int            NULL,
    RowsDeleted      int            NULL,
    StagingChecksum  nvarchar(64)   NULL,
    TargetChecksum   nvarchar(64)   NULL,
    ErrorCode        nvarchar(64)   NULL,
    ErrorDetail      nvarchar(1000) NULL,
    DurationMs       int            NULL,
    CONSTRAINT PK_ImportRunFeeds PRIMARY KEY CLUSTERED (RunId, ProviderId, FeedKey)
  );
END
GO

IF OBJECT_ID(N'ingest.ImportFiles', N'U') IS NULL
BEGIN
  CREATE TABLE ingest.ImportFiles (
    FileKey      nvarchar(512)  NOT NULL,
    Version      nvarchar(128)  NOT NULL,
    ProviderId   nvarchar(64)   NOT NULL,
    FeedKey      nvarchar(128)  NOT NULL,
    Status       nvarchar(32)   NOT NULL,
    FirstSeenAt  datetime2(3)   NOT NULL CONSTRAINT DF_ImportFiles_FirstSeenAt DEFAULT (sysutcdatetime()),
    OkAt         datetime2(3)   NULL,
    CONSTRAINT PK_ImportFiles PRIMARY KEY CLUSTERED (FileKey, Version),
    CONSTRAINT CK_ImportFiles_Status CHECK (Status IN (N'pending', N'ok', N'failed', N'superseded'))
  );
END
GO

IF OBJECT_ID(N'ingest.PartsStaging', N'U') IS NULL
BEGIN
  CREATE TABLE ingest.PartsStaging (
    RunId              bigint         NOT NULL,
    ProviderId         nvarchar(64)   NOT NULL,
    FeedKey            nvarchar(128)  NOT NULL,
    RowNum             int            NOT NULL,
    MerchantProductId  nvarchar(256)  NOT NULL,
    Title              nvarchar(512)  NULL,
    Description        nvarchar(max)  NULL,
    Brand              nvarchar(256)  NULL,
    Category           nvarchar(512)  NULL,
    Price              decimal(18,4)  NULL,
    Currency           nvarchar(8)    NULL,
    Url                nvarchar(2048) NULL,
    ImageUrl           nvarchar(2048) NULL,
    Gtin               nvarchar(64)   NULL,
    Ean                nvarchar(64)   NULL,
    Mpn                nvarchar(64)   NULL,
    Availability       nvarchar(32)   NULL,
    LinkData           nvarchar(1000) NULL,
    Class              nvarchar(16)   NULL,
    ContentHash        nvarchar(128)  NULL,
    Env                nvarchar(16)   NOT NULL
  );
END
GO

IF OBJECT_ID(N'ingest.Rejects', N'U') IS NULL
BEGIN
  CREATE TABLE ingest.Rejects (
    RunId       bigint         NOT NULL,
    ProviderId  nvarchar(64)   NOT NULL,
    FeedKey     nvarchar(128)  NOT NULL,
    FileKey     nvarchar(512)  NULL,
    RowNum      int            NULL,
    Reason      nvarchar(64)   NOT NULL,
    RawRow      nvarchar(4000) NULL
  );
END
GO

IF OBJECT_ID(N'ingest.Failures', N'U') IS NULL
BEGIN
  CREATE TABLE ingest.Failures (
    FailureId         bigint         NOT NULL IDENTITY(1,1),
    RunId             bigint         NOT NULL,
    ProviderId        nvarchar(64)   NOT NULL,
    FeedKey           nvarchar(128)  NOT NULL,
    FileKey           nvarchar(512)  NULL,
    ErrorCode         nvarchar(64)   NOT NULL,
    ErrorDetail       nvarchar(2000) NULL,
    SampleBadRowsPath nvarchar(512)  NULL,
    ProviderJsonSha   nvarchar(64)   NULL,
    AgentStatus       nvarchar(32)   NULL,
    AgentStartedAt    datetime2(3)   NULL,
    IssueUrl          nvarchar(512)  NULL,
    PrUrl             nvarchar(512)  NULL,
    CreatedAt         datetime2(3)   NOT NULL CONSTRAINT DF_Failures_CreatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_Failures PRIMARY KEY CLUSTERED (FailureId)
  );
END
GO

IF OBJECT_ID(N'ingest.PurgeRequests', N'U') IS NULL
BEGIN
  CREATE TABLE ingest.PurgeRequests (
    ProviderId      nvarchar(64)  NOT NULL,
    FeedKey         nvarchar(128) NOT NULL,
    Reason          nvarchar(64)  NOT NULL,
    RequestedAt     datetime2(3)  NOT NULL CONSTRAINT DF_PurgeRequests_RequestedAt DEFAULT (sysutcdatetime()),
    ProcessedRunId  bigint        NULL,
    CONSTRAINT PK_PurgeRequests PRIMARY KEY CLUSTERED (ProviderId, FeedKey, RequestedAt)
  );
END
GO

-- RCSI so searches never block on import transactions
IF EXISTS (SELECT 1 FROM sys.databases WHERE name = DB_NAME() AND is_read_committed_snapshot_on = 0)
BEGIN
  DECLARE @db sysname = DB_NAME();
  DECLARE @sql nvarchar(400) = N'ALTER DATABASE ' + QUOTENAME(@db) + N' SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;';
  EXEC (@sql);
END
GO
