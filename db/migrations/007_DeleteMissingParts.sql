-- target: a_search
-- FR-251: moved from maintainer/sql/005_DeleteMissingParts.sql
-- FR-015 / FR #4518: soft-delete Parts missing from PartsStaging as a procedure
-- Scope: @Source + @FeedKey + @Env only. Do not clear the whole Parts table.
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE dbo.DeleteMissingParts
  @Source nvarchar(64),
  @FeedKey nvarchar(128),
  @Env nvarchar(16)
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE T
  SET DeletedAt = SYSUTCDATETIME(),
      UpdatedAt = SYSUTCDATETIME()
  FROM dbo.Parts AS T
  WHERE T.Source = @Source
    AND T.FeedKey = @FeedKey
    AND T.Env = @Env
    AND T.DeletedAt IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM dbo.PartsStaging AS S
      WHERE S.Source = T.Source
        AND S.FeedKey = T.FeedKey
        AND S.Env = T.Env
        AND S.MerchantProductId = T.MerchantProductId
    );
END
GO
