-- target: a_search
-- FR-234: WidgetStatsDaily + WidgetEventDedupe (a_search / a_search_sandbox only).
-- Never madeiradb (FR-251). No client address / cookie / UA / account id columns.
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.WidgetStatsDaily', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.WidgetStatsDaily (
    Env                 nvarchar(16)     NOT NULL,
    CustomerNumber      bigint           NULL,
    WidgetGuid          uniqueidentifier NOT NULL,
    PartNumber          nvarchar(128)    NOT NULL
      CONSTRAINT DF_WidgetStatsDaily_PartNumber DEFAULT (N''),
    Day                 date             NOT NULL,
    PartClass           nvarchar(16)     NOT NULL
      CONSTRAINT DF_WidgetStatsDaily_PartClass DEFAULT (N'affiliate'),
    TenantId            nvarchar(64)     NULL,
    Views               int              NOT NULL
      CONSTRAINT DF_WidgetStatsDaily_Views DEFAULT (0),
    PartImpressions     int              NOT NULL
      CONSTRAINT DF_WidgetStatsDaily_PartImpressions DEFAULT (0),
    Clicks              int              NOT NULL
      CONSTRAINT DF_WidgetStatsDaily_Clicks DEFAULT (0),
    ClicksServer        int              NOT NULL
      CONSTRAINT DF_WidgetStatsDaily_ClicksServer DEFAULT (0),
    ClicksClientOnly    int              NOT NULL
      CONSTRAINT DF_WidgetStatsDaily_ClicksClientOnly DEFAULT (0),
    CONSTRAINT PK_WidgetStatsDaily PRIMARY KEY CLUSTERED (
      Env, WidgetGuid, PartNumber, Day, PartClass
    ),
    CONSTRAINT CK_WidgetStatsDaily_Env CHECK (Env IN (N'live', N'sandbox')),
    CONSTRAINT CK_WidgetStatsDaily_PartClass CHECK (
      PartClass IN (N'affiliate', N'merchant', N'provider')
    )
  );
END
GO

IF OBJECT_ID(N'dbo.WidgetEventDedupe', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.WidgetEventDedupe (
    DedupeKey           nvarchar(256)    NOT NULL,
    ExpiresAt           datetime2(3)     NOT NULL,
    CONSTRAINT PK_WidgetEventDedupe PRIMARY KEY CLUSTERED (DedupeKey)
  );
END
GO
