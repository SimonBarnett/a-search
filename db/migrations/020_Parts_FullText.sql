-- target: a_search
-- FR #4463: FULLTEXT index on Parts (never disable; CHANGE_TRACKING AUTO)
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = N'ftc_a_search_parts')
BEGIN
  CREATE FULLTEXT CATALOG ftc_a_search_parts AS DEFAULT;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.fulltext_indexes
  WHERE object_id = OBJECT_ID(N'dbo.Parts')
)
BEGIN
  CREATE FULLTEXT INDEX ON dbo.Parts (
    Title LANGUAGE 2057,
    Description LANGUAGE 2057,
    Brand LANGUAGE 2057,
    Category LANGUAGE 2057
  )
  KEY INDEX UX_Parts_PartId
  ON ftc_a_search_parts
  WITH (CHANGE_TRACKING = AUTO, STOPLIST = SYSTEM);
END
GO
