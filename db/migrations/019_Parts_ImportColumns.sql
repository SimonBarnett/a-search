-- target: a_search
-- FR #4463: Parts columns for daily affiliate+merchant import + FTS key
SET NOCOUNT ON;
GO

IF COL_LENGTH(N'dbo.Parts', N'PartId') IS NULL
BEGIN
  ALTER TABLE dbo.Parts ADD PartId bigint IDENTITY(1,1) NOT NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UX_Parts_PartId' AND object_id = OBJECT_ID(N'dbo.Parts')
)
BEGIN
  CREATE UNIQUE NONCLUSTERED INDEX UX_Parts_PartId ON dbo.Parts (PartId);
END
GO

IF COL_LENGTH(N'dbo.Parts', N'Class') IS NULL
BEGIN
  ALTER TABLE dbo.Parts ADD Class nvarchar(16) NULL;
END
GO

IF COL_LENGTH(N'dbo.Parts', N'Brand') IS NULL
BEGIN
  ALTER TABLE dbo.Parts ADD Brand nvarchar(256) NULL;
END
GO

IF COL_LENGTH(N'dbo.Parts', N'Category') IS NULL
BEGIN
  ALTER TABLE dbo.Parts ADD Category nvarchar(512) NULL;
END
GO

IF COL_LENGTH(N'dbo.Parts', N'Gtin') IS NULL
BEGIN
  ALTER TABLE dbo.Parts ADD Gtin nvarchar(64) NULL;
END
GO

IF COL_LENGTH(N'dbo.Parts', N'Ean') IS NULL
BEGIN
  ALTER TABLE dbo.Parts ADD Ean nvarchar(64) NULL;
END
GO

IF COL_LENGTH(N'dbo.Parts', N'Mpn') IS NULL
BEGIN
  ALTER TABLE dbo.Parts ADD Mpn nvarchar(64) NULL;
END
GO

IF COL_LENGTH(N'dbo.Parts', N'Availability') IS NULL
BEGIN
  ALTER TABLE dbo.Parts ADD Availability nvarchar(32) NULL;
END
GO

IF COL_LENGTH(N'dbo.Parts', N'LinkData') IS NULL
BEGIN
  ALTER TABLE dbo.Parts ADD LinkData nvarchar(1000) NULL;
END
GO

IF COL_LENGTH(N'dbo.Parts', N'LastSeenRunId') IS NULL
BEGIN
  ALTER TABLE dbo.Parts ADD LastSeenRunId bigint NULL;
END
GO
