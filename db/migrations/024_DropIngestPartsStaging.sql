-- target: a_search
-- FR #4941: one staging table. dbo.PartsStaging is canonical (FR-011).
-- Copy leftover ingest rows if that table still exists, then drop it.
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'ingest.PartsStaging', N'U') IS NOT NULL
BEGIN
  IF OBJECT_ID(N'dbo.PartsStaging', N'U') IS NOT NULL
  BEGIN
    INSERT INTO dbo.PartsStaging (
      Source, FeedKey, MerchantProductId, Env,
      Title, Description, Url, ImageUrl, Price, Currency, ContentHash
    )
    SELECT
      ProviderId, FeedKey, MerchantProductId, Env,
      Title, Description, Url, ImageUrl, Price, Currency, ContentHash
    FROM ingest.PartsStaging AS I
    WHERE NOT EXISTS (
      SELECT 1 FROM dbo.PartsStaging D
      WHERE D.Source = I.ProviderId AND D.FeedKey = I.FeedKey
        AND D.MerchantProductId = I.MerchantProductId AND D.Env = I.Env
    );
  END
  DROP TABLE ingest.PartsStaging;
END
GO
