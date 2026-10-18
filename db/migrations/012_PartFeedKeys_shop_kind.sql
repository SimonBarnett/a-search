-- target: a_search
-- FR-240: PartFeedKeys Kind/Active/Locator for merchant shop sync
-- Target: a_search / a_search_sandbox only (FR-251). Never madeiradb.
SET NOCOUNT ON;
GO

IF COL_LENGTH(N'dbo.PartFeedKeys', N'Kind') IS NULL
BEGIN
  ALTER TABLE dbo.PartFeedKeys
    ADD Kind nvarchar(32) NOT NULL
      CONSTRAINT DF_PartFeedKeys_Kind DEFAULT (N'feed');
END
GO

IF COL_LENGTH(N'dbo.PartFeedKeys', N'Active') IS NULL
BEGIN
  ALTER TABLE dbo.PartFeedKeys
    ADD Active bit NOT NULL
      CONSTRAINT DF_PartFeedKeys_Active DEFAULT (1);
END
GO

IF COL_LENGTH(N'dbo.PartFeedKeys', N'Locator') IS NULL
BEGIN
  ALTER TABLE dbo.PartFeedKeys
    ADD Locator nvarchar(2048) NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_PartFeedKeys_Kind_Active_NextCheck'
    AND object_id = OBJECT_ID(N'dbo.PartFeedKeys')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_PartFeedKeys_Kind_Active_NextCheck
    ON dbo.PartFeedKeys (Kind, Active, Env, NextCheck)
    INCLUDE (Source, FeedKey, Locator);
END
GO
