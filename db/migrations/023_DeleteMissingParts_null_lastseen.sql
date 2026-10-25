-- target: a_search
-- FR #4942: never soft-delete Parts that never got a LastSeenRunId
-- (folder dbimport / any loader that bypassed ingest.ImportRuns).
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
    AND T.LastSeenRunId IS NOT NULL
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
