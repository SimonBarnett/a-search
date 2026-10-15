-- FR-249 / #1363: ClubPoolBudget + RevenueSharePeriods + ClubRevenueShares
-- Apply to a_search (live) / a_search_sandbox (sandbox). Never modify madeiradb.
-- Club identity is read-only via mdb.* views (FR-251).

IF OBJECT_ID(N'dbo.ClubPoolBudget', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ClubPoolBudget (
    PeriodId     char(7)         NOT NULL CONSTRAINT PK_ClubPoolBudget PRIMARY KEY, -- YYYY-MM
    AmountMinor  int             NOT NULL,
    SetBy        nvarchar(64)    NOT NULL,
    SetAt        datetime2(3)    NOT NULL CONSTRAINT DF_ClubPoolBudget_SetAt DEFAULT SYSUTCDATETIME(),
    Note         nvarchar(512)   NULL,
    CONSTRAINT CK_ClubPoolBudget_Amount CHECK (AmountMinor >= 0),
    CONSTRAINT CK_ClubPoolBudget_Period CHECK (PeriodId LIKE '[0-9][0-9][0-9][0-9]-[0-9][0-9]')
  );
END
GO

IF OBJECT_ID(N'dbo.RevenueSharePeriods', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.RevenueSharePeriods (
    PeriodId          char(7)         NOT NULL CONSTRAINT PK_RevenueSharePeriods PRIMARY KEY,
    Status            nvarchar(16)    NOT NULL CONSTRAINT DF_RevenueSharePeriods_Status DEFAULT N'open',
    BudgetMinor       int             NOT NULL,
    PoolMinor         int             NOT NULL,
    AllocatedMinor    int             NOT NULL CONSTRAINT DF_RevenueSharePeriods_Allocated DEFAULT 0,
    RemainderMinor    int             NOT NULL CONSTRAINT DF_RevenueSharePeriods_Remainder DEFAULT 0,
    TotalClicks       int             NOT NULL CONSTRAINT DF_RevenueSharePeriods_Clicks DEFAULT 0,
    RollOutMinor      int             NOT NULL CONSTRAINT DF_RevenueSharePeriods_RollOut DEFAULT 0,
    RuleVersion       nvarchar(64)    NOT NULL,
    ConfigJson        nvarchar(max)   NOT NULL,
    InputsChecksum    nvarchar(128)   NULL,
    ClosedAt          datetime2(3)    NULL,
    CONSTRAINT CK_RevenueSharePeriods_Status CHECK (Status IN (N'open', N'closing', N'closed'))
  );
END
GO

IF OBJECT_ID(N'dbo.ClubRevenueShares', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ClubRevenueShares (
    PeriodId     char(7)         NOT NULL,
    ClubId       nvarchar(64)    NOT NULL,
    Clicks       int             NOT NULL CONSTRAINT DF_ClubRevenueShares_Clicks DEFAULT 0,
    Impressions  int             NOT NULL CONSTRAINT DF_ClubRevenueShares_Impr DEFAULT 0,
    Score        float           NOT NULL CONSTRAINT DF_ClubRevenueShares_Score DEFAULT 0,
    AmountMinor  int             NOT NULL CONSTRAINT DF_ClubRevenueShares_Amount DEFAULT 0,
    Flagged      bit             NOT NULL CONSTRAINT DF_ClubRevenueShares_Flagged DEFAULT 0,
    CONSTRAINT PK_ClubRevenueShares PRIMARY KEY (PeriodId, ClubId),
    CONSTRAINT FK_ClubRevenueShares_Period FOREIGN KEY (PeriodId)
      REFERENCES dbo.RevenueSharePeriods (PeriodId)
  );
  CREATE INDEX IX_ClubRevenueShares_Club ON dbo.ClubRevenueShares (ClubId, PeriodId);
END
GO
