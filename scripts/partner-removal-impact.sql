-- FR-118: pre-removal impact counts for one user/partner/club code.
-- Read-only. Set @Code then run. Do not change data.
-- Example: DECLARE @Code varchar(8) = 'MWRJCP92';

DECLARE @Code varchar(8) = '________'; -- replace with candidate code

SELECT N'Products.UserId' AS [Bucket], COUNT_BIG(*) AS [Rows]
FROM dbo.Products WHERE CONVERT(varchar(8), RTRIM(UserId)) = @Code
UNION ALL
SELECT N'RejectedAsins.UserId', COUNT_BIG(*)
FROM dbo.RejectedAsins WHERE CONVERT(varchar(8), RTRIM(UserId)) = @Code
UNION ALL
SELECT N'Catalog.UserId', COUNT_BIG(*)
FROM dbo.Catalog WHERE CONVERT(varchar(8), RTRIM(UserId)) = @Code
UNION ALL
SELECT N'CatalogAffiliateUpdates via Catalog', COUNT_BIG(*)
FROM dbo.CatalogAffiliateUpdates cau
INNER JOIN dbo.Catalog c ON c.ID = cau.CatalogId
WHERE CONVERT(varchar(8), RTRIM(c.UserId)) = @Code
UNION ALL
SELECT N'MerchantProducts.UserId', COUNT_BIG(*)
FROM dbo.MerchantProducts WHERE CONVERT(varchar(8), RTRIM(UserId)) = @Code
UNION ALL
SELECT N'UserCategories.uid', COUNT_BIG(*)
FROM dbo.UserCategories WHERE CONVERT(varchar(8), RTRIM(uid)) = @Code
UNION ALL
SELECT N'UserApiKeys.user_id', COUNT_BIG(*)
FROM dbo.UserApiKeys WHERE user_id = @Code
UNION ALL
SELECT N'UserFingerprints.user_id', COUNT_BIG(*)
FROM dbo.UserFingerprints WHERE user_id = @Code
UNION ALL
SELECT N'SystemOTPs.user_id', COUNT_BIG(*)
FROM dbo.SystemOTPs WHERE user_id = @Code
UNION ALL
SELECT N'DatabaseCallLog.UserId', COUNT_BIG(*)
FROM dbo.DatabaseCallLog WHERE CONVERT(varchar(8), RTRIM(UserId)) = @Code
UNION ALL
SELECT N'clubscan.ClubID', COUNT_BIG(*)
FROM dbo.clubscan WHERE ClubID = @Code
UNION ALL
SELECT N'clubscan.PartnerId', COUNT_BIG(*)
FROM dbo.clubscan WHERE PartnerId = @Code
UNION ALL
SELECT N'Users.user_id', COUNT_BIG(*)
FROM dbo.Users WHERE user_id = @Code
UNION ALL
SELECT N'Users.referrer', COUNT_BIG(*)
FROM dbo.Users WHERE referrer = @Code
UNION ALL
SELECT N'Partner.PartnerID', COUNT_BIG(*)
FROM dbo.Partner WHERE PartnerID = @Code
UNION ALL
SELECT N'MerchantCatalog via Catalog', COUNT_BIG(*)
FROM dbo.MerchantCatalog mc
INNER JOIN dbo.Catalog c ON c.ID = mc.CatalogID
WHERE CONVERT(varchar(8), RTRIM(c.UserId)) = @Code
UNION ALL
SELECT N'AwinHighApprovalMerchants.PartnerID', COUNT_BIG(*)
FROM dbo.AwinHighApprovalMerchants WHERE CONVERT(varchar(8), RTRIM(PartnerID)) = @Code
UNION ALL
SELECT N'AwinHighApprovalMerchants.ClubID', COUNT_BIG(*)
FROM dbo.AwinHighApprovalMerchants WHERE ClubID = @Code
UNION ALL
SELECT N'AwinTransactions.ClubID', COUNT_BIG(*)
FROM dbo.AwinTransactions WHERE CONVERT(varchar(8), RTRIM(ClubID)) = @Code
UNION ALL
SELECT N'Commissions.MerchantId', COUNT_BIG(*)
FROM dbo.Commissions WHERE CONVERT(varchar(8), RTRIM(MerchantId)) = @Code
UNION ALL
SELECT N'Payments.UserId', COUNT_BIG(*)
FROM dbo.Payments WHERE CONVERT(varchar(8), RTRIM(UserId)) = @Code
ORDER BY [Bucket];
