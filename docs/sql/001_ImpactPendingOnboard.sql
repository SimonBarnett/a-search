-- FR-051a: Impact pending-onboard queue (migrate-once, IF NOT EXISTS)
-- Used when Impact catalogue-join API is UNKNOWN so onboarding drain can
-- still reach remaining=0. See docs/impact-pending-onboard-queue.md.
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.ImpactPendingOnboard', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ImpactPendingOnboard (
    Id              bigint IDENTITY(1,1) NOT NULL,
    Env             nvarchar(16)  NOT NULL,
    MerchantId      nvarchar(128) NOT NULL,
    MerchantName    nvarchar(512) NULL,
    Status          nvarchar(32)  NOT NULL
      CONSTRAINT DF_ImpactPendingOnboard_Status DEFAULT (N'pending'),
    EnqueuedAt      datetime2(3)  NOT NULL
      CONSTRAINT DF_ImpactPendingOnboard_EnqueuedAt DEFAULT (sysutcdatetime()),
    ProcessedAt     datetime2(3)  NULL,
    LastError       nvarchar(max) NULL,
    Notes           nvarchar(1024) NULL,
    CONSTRAINT PK_ImpactPendingOnboard PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_ImpactPendingOnboard_Env
      CHECK (Env IN (N'live', N'sandbox')),
    CONSTRAINT CK_ImpactPendingOnboard_Status
      CHECK (Status IN (N'pending', N'processing', N'done', N'error'))
  );
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_ImpactPendingOnboard_Env_Status'
    AND object_id = OBJECT_ID(N'dbo.ImpactPendingOnboard')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_ImpactPendingOnboard_Env_Status
    ON dbo.ImpactPendingOnboard (Env, Status)
    INCLUDE (MerchantId, MerchantName, EnqueuedAt);
END
GO
