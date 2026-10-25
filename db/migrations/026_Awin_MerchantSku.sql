-- target: a_search
-- FR #4941: keep merchant_product_id as MerchantSku; Parts key stays
-- MerchantProductId which Awin folder dbimport now fills from aw_product_id.
-- Existing 1.8M Awin rows: copy current MerchantProductId into MerchantSku
-- (those values are the old merchant sku). Next successful dbimport upserts
-- by aw_product_id; NULL LastSeen rows are not DeleteMissing'd (FR #4942).
SET NOCOUNT ON;
GO

IF COL_LENGTH(N'dbo.Parts', N'MerchantSku') IS NULL
BEGIN
  ALTER TABLE dbo.Parts ADD MerchantSku nvarchar(256) NULL;
END
GO

IF COL_LENGTH(N'dbo.PartsStaging', N'MerchantSku') IS NULL
BEGIN
  ALTER TABLE dbo.PartsStaging ADD MerchantSku nvarchar(256) NULL;
END
GO

UPDATE dbo.Parts
SET MerchantSku = MerchantProductId
WHERE Source = N'awin'
  AND MerchantSku IS NULL;
GO
