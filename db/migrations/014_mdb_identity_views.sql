-- target: a_search
-- FR-251 / #1365: mdb schema for madeiradb identity (read-only).
-- Live (a_search): views over MADEIRADB_DATABASE (default madeiradb) via three-part names.
-- Sandbox (a_search_sandbox): empty tables for anonymised copy (no madeiradb access).

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'mdb')
  EXEC(N'CREATE SCHEMA mdb');
GO

DECLARE @db sysname = DB_NAME();
DECLARE @madeira sysname = COALESCE(NULLIF(CAST(SERVERPROPERTY('MachineName') AS nvarchar(128)), N''), N'madeiradb');
-- Prefer env-style override via SESSION_CONTEXT if ops set it; else madeiradb.
IF SESSION_CONTEXT(N'MADEIRADB_DATABASE') IS NOT NULL
  SET @madeira = CONVERT(sysname, SESSION_CONTEXT(N'MADEIRADB_DATABASE'));
ELSE
  SET @madeira = N'madeiradb';

IF @db = N'a_search'
BEGIN
  -- Live: read-only views (no instead-of triggers).
  IF OBJECT_ID(N'mdb.Users', N'V') IS NULL
    EXEC(N'CREATE VIEW mdb.Users AS SELECT user_id, role, permissions, referrer, email FROM ' + QUOTENAME(@madeira) + N'.dbo.Users');
  IF OBJECT_ID(N'mdb.Partner', N'V') IS NULL
    EXEC(N'CREATE VIEW mdb.Partner AS SELECT PartnerID, Approved FROM ' + QUOTENAME(@madeira) + N'.dbo.Partner');
  IF OBJECT_ID(N'mdb.clubscan', N'V') IS NULL
    EXEC(N'CREATE VIEW mdb.clubscan AS SELECT ClubID, PartnerId, Url, active FROM ' + QUOTENAME(@madeira) + N'.dbo.clubscan');
  IF OBJECT_ID(N'mdb.UserApiKeys', N'V') IS NULL
    EXEC(N'CREATE VIEW mdb.UserApiKeys AS SELECT user_id, api_key_type FROM ' + QUOTENAME(@madeira) + N'.dbo.UserApiKeys');
END
ELSE IF @db = N'a_search_sandbox'
BEGIN
  -- Sandbox: anonymised copy tables (ops refresh); never three-part madeiradb.
  IF OBJECT_ID(N'mdb.Users', N'U') IS NULL
  BEGIN
    CREATE TABLE mdb.Users (
      user_id      varchar(8)      NOT NULL CONSTRAINT PK_mdb_Users PRIMARY KEY,
      role         nvarchar(32)    NULL,
      permissions  nvarchar(max)   NULL,
      referrer     nvarchar(64)    NULL,
      email        nvarchar(256)   NULL
    );
  END
  IF OBJECT_ID(N'mdb.Partner', N'U') IS NULL
  BEGIN
    CREATE TABLE mdb.Partner (
      PartnerID  nvarchar(64)  NOT NULL CONSTRAINT PK_mdb_Partner PRIMARY KEY,
      Approved   bit           NOT NULL CONSTRAINT DF_mdb_Partner_Approved DEFAULT 0
    );
  END
  IF OBJECT_ID(N'mdb.clubscan', N'U') IS NULL
  BEGIN
    CREATE TABLE mdb.clubscan (
      ClubID     nvarchar(64)   NOT NULL,
      PartnerId  nvarchar(64)   NULL,
      Url        nvarchar(2048) NULL,
      active     bit            NULL,
      CONSTRAINT PK_mdb_clubscan PRIMARY KEY (ClubID)
    );
  END
  IF OBJECT_ID(N'mdb.UserApiKeys', N'U') IS NULL
  BEGIN
    CREATE TABLE mdb.UserApiKeys (
      user_id       varchar(8)    NOT NULL,
      api_key_type  nvarchar(64)  NOT NULL,
      CONSTRAINT PK_mdb_UserApiKeys PRIMARY KEY (user_id, api_key_type)
    );
  END
END
GO
