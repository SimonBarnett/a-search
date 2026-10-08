-- FR-117: read-only orphan report for madeiradb logical user/partner/club codes.
-- Read-only catalog report. Do not change data.
-- Compare codes with CONVERT(varchar(8), ...) after RTRIM; repair of orphans is DBA OOS.

SET NOCOUNT ON;

-- RejectedAsins.UserId not in Users
SELECT N'RejectedAsins.UserId' AS [Column], r.UserId AS OrphanCode, COUNT_BIG(*) AS OrphanRows
FROM dbo.RejectedAsins AS r
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.Users AS u
  WHERE u.user_id = CONVERT(varchar(8), RTRIM(r.UserId))
)
GROUP BY r.UserId
ORDER BY OrphanRows DESC;

-- Products.UserId not in Users
SELECT N'Products.UserId' AS [Column], p.UserId AS OrphanCode, COUNT_BIG(*) AS OrphanRows
FROM dbo.Products AS p
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.Users AS u
  WHERE u.user_id = CONVERT(varchar(8), RTRIM(p.UserId))
)
GROUP BY p.UserId
ORDER BY OrphanRows DESC;

-- DatabaseCallLog.UserId not in Users
SELECT N'DatabaseCallLog.UserId' AS [Column], d.UserId AS OrphanCode, COUNT_BIG(*) AS OrphanRows
FROM dbo.DatabaseCallLog AS d
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.Users AS u
  WHERE u.user_id = CONVERT(varchar(8), RTRIM(d.UserId))
)
GROUP BY d.UserId
ORDER BY OrphanRows DESC;

-- Payments.UserId not in Users
SELECT N'Payments.UserId' AS [Column], pay.UserId AS OrphanCode, COUNT_BIG(*) AS OrphanRows
FROM dbo.Payments AS pay
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.Users AS u
  WHERE u.user_id = CONVERT(varchar(8), RTRIM(pay.UserId))
)
GROUP BY pay.UserId
ORDER BY OrphanRows DESC;

-- Commissions.MerchantId not in Users
SELECT N'Commissions.MerchantId' AS [Column], c.MerchantId AS OrphanCode, COUNT_BIG(*) AS OrphanRows
FROM dbo.Commissions AS c
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.Users AS u
  WHERE u.user_id = CONVERT(varchar(8), RTRIM(c.MerchantId))
)
GROUP BY c.MerchantId
ORDER BY OrphanRows DESC;

-- UserCategories.uid not in Users
SELECT N'UserCategories.uid' AS [Column], uc.uid AS OrphanCode, COUNT_BIG(*) AS OrphanRows
FROM dbo.UserCategories AS uc
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.Users AS u
  WHERE u.user_id = CONVERT(varchar(8), RTRIM(uc.uid))
)
GROUP BY uc.uid
ORDER BY OrphanRows DESC;

-- AwinHighApprovalMerchants.PartnerID not in Users (includes non-8-char junk e.g. 2889699)
SELECT N'AwinHighApprovalMerchants.PartnerID' AS [Column], a.PartnerID AS OrphanCode, COUNT_BIG(*) AS OrphanRows
FROM dbo.AwinHighApprovalMerchants AS a
WHERE a.PartnerID IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM dbo.Users AS u
    WHERE u.user_id = CONVERT(varchar(8), RTRIM(a.PartnerID))
  )
GROUP BY a.PartnerID
ORDER BY OrphanRows DESC;

-- AwinTransactions.ClubID not in Users (often TEST-… sandbox)
SELECT N'AwinTransactions.ClubID' AS [Column], t.ClubID AS OrphanCode, COUNT_BIG(*) AS OrphanRows
FROM dbo.AwinTransactions AS t
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.Users AS u
  WHERE u.user_id = CONVERT(varchar(8), RTRIM(t.ClubID))
)
GROUP BY t.ClubID
ORDER BY OrphanRows DESC;

-- FingerprintCatalogAccess.catalog_id missing from Catalog (non-user orphan)
SELECT N'FingerprintCatalogAccess.catalog_id' AS [Column],
       CONVERT(nvarchar(32), f.catalog_id) AS OrphanCode,
       COUNT_BIG(*) AS OrphanRows
FROM dbo.FingerprintCatalogAccess AS f
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.Catalog AS c WHERE c.ID = f.catalog_id
)
GROUP BY f.catalog_id
ORDER BY OrphanRows DESC;
