-- FR-015: soft-delete Parts missing from PartsStaging for one feed key
-- Scope: @Source + @FeedKey + @Env only. Do not clear the whole Parts table.
SET NOCOUNT ON;
GO

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
GO
