-- target: a_search
-- FR-251 / #1365: SchemaMigrations ledger for db-migrate.js

IF OBJECT_ID(N'dbo.SchemaMigrations', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SchemaMigrations (
    Name       nvarchar(256)  NOT NULL CONSTRAINT PK_SchemaMigrations PRIMARY KEY,
    Sha256     char(64)       NOT NULL,
    AppliedAt  datetime2(3)   NOT NULL CONSTRAINT DF_SchemaMigrations_AppliedAt DEFAULT SYSUTCDATETIME()
  );
END
GO
