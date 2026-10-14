-- FR-196: Customers registry for ComponentsPiece (a_search / a_search_sandbox only).
-- Run against a_search (live) or a_search_sandbox (sandbox). Never madeiradb (FR-251).
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.Customers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Customers (
    CustomerNumber            bigint         NOT NULL IDENTITY(1, 1),
    Host                      nvarchar(253)  NOT NULL,
    Approved                  bit            NOT NULL
      CONSTRAINT DF_Customers_Approved DEFAULT (0),
    ClubId                    nvarchar(64)   NULL,
    PartnerId                 nvarchar(64)   NULL,
    DnsCheckedAt              datetime2(3)   NULL,
    UpgradeStatus             nvarchar(16)   NOT NULL
      CONSTRAINT DF_Customers_UpgradeStatus DEFAULT (N'none'),
    UpgradeSubscriptionId     nvarchar(128)  NULL,
    UpgradeCheckedAt          datetime2(3)   NULL,
    CreatedAt                 datetime2(3)   NOT NULL
      CONSTRAINT DF_Customers_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt                 datetime2(3)   NOT NULL
      CONSTRAINT DF_Customers_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_Customers PRIMARY KEY CLUSTERED (CustomerNumber),
    CONSTRAINT UQ_Customers_Host UNIQUE (Host),
    CONSTRAINT CK_Customers_UpgradeStatus CHECK (
      UpgradeStatus IN (N'none', N'active', N'lapsed')
    )
  );
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_Customers_Approved_Host'
    AND object_id = OBJECT_ID(N'dbo.Customers')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Customers_Approved_Host
    ON dbo.Customers (Approved, Host);
END
GO
