-- target: a_search
-- FR-251: moved from maintainer/sql/004_MergeParts.sql
-- FR-014 / FR #4518: dbo.MergeParts procedure (set-based MERGE PartsStaging -> Parts)
-- Apply after bulk load into PartsStaging. No per-row INSERT loop.
-- Runtime: EXEC dbo.MergeParts @Source=..., @FeedKey=..., @Env=...
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE dbo.MergeParts
  @Source nvarchar(64),
  @FeedKey nvarchar(128),
  @Env nvarchar(16)
AS
BEGIN
  SET NOCOUNT ON;

  MERGE dbo.Parts AS T
  USING (
    SELECT *
    FROM dbo.PartsStaging
    WHERE Source = @Source
      AND FeedKey = @FeedKey
      AND Env = @Env
  ) AS S
  ON T.Source = S.Source
   AND T.FeedKey = S.FeedKey
   AND T.MerchantProductId = S.MerchantProductId
   AND T.Env = S.Env
  WHEN MATCHED AND (
    ISNULL(T.ContentHash, N'') <> ISNULL(S.ContentHash, N'')
  )
  THEN UPDATE SET
    Title = S.Title,
    Description = S.Description,
    Url = S.Url,
    ImageUrl = S.ImageUrl,
    Price = S.Price,
    Currency = S.Currency,
    Stock = S.Stock,
    ContentHash = S.ContentHash,
    DeletedAt = NULL,
    UpdatedAt = SYSUTCDATETIME()
  WHEN NOT MATCHED BY TARGET
  THEN INSERT (
    Source, FeedKey, MerchantProductId, Env,
    Title, Description, Url, ImageUrl, Price, Currency, Stock, ContentHash
  ) VALUES (
    S.Source, S.FeedKey, S.MerchantProductId, S.Env,
    S.Title, S.Description, S.Url, S.ImageUrl, S.Price, S.Currency, S.Stock, S.ContentHash
  );
END
GO
