-- target: a_search
-- FR #5282: FULLTEXT on Parts must search Brand, Mpn, MerchantSku
-- (Brand was already indexed in 020 but unused in CONTAINS/FREETEXTTABLE).
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = N'ftc_a_search_parts')
BEGIN
  CREATE FULLTEXT CATALOG ftc_a_search_parts AS DEFAULT;
END
GO

IF EXISTS (
  SELECT 1 FROM sys.fulltext_indexes
  WHERE object_id = OBJECT_ID(N'dbo.Parts')
)
BEGIN
  IF COL_LENGTH(N'dbo.Parts', N'Mpn') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.fulltext_index_columns fic
      INNER JOIN sys.columns c
        ON c.object_id = fic.object_id AND c.column_id = fic.column_id
      WHERE fic.object_id = OBJECT_ID(N'dbo.Parts')
        AND c.name = N'Mpn'
    )
  BEGIN
    ALTER FULLTEXT INDEX ON dbo.Parts ADD (Mpn LANGUAGE 2057);
  END

  IF COL_LENGTH(N'dbo.Parts', N'MerchantSku') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM sys.fulltext_index_columns fic
      INNER JOIN sys.columns c
        ON c.object_id = fic.object_id AND c.column_id = fic.column_id
      WHERE fic.object_id = OBJECT_ID(N'dbo.Parts')
        AND c.name = N'MerchantSku'
    )
  BEGIN
    ALTER FULLTEXT INDEX ON dbo.Parts ADD (MerchantSku LANGUAGE 2057);
  END
END
ELSE IF OBJECT_ID(N'dbo.Parts', N'U') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_Parts_PartId' AND object_id = OBJECT_ID(N'dbo.Parts')
  )
BEGIN
  CREATE FULLTEXT INDEX ON dbo.Parts (
    Title LANGUAGE 2057,
    Description LANGUAGE 2057,
    Brand LANGUAGE 2057,
    Category LANGUAGE 2057,
    Mpn LANGUAGE 2057,
    MerchantSku LANGUAGE 2057
  )
  KEY INDEX UX_Parts_PartId
  ON ftc_a_search_parts
  WITH (CHANGE_TRACKING = AUTO, STOPLIST = SYSTEM);
END
GO
