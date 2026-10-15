-- FR-239 / #1353: Shop subscription columns + ShopInvoices + StripeEvents.
-- Apply to a_search (live) / a_search_sandbox (sandbox). Never modify madeiradb (FR-251).

IF COL_LENGTH(N'dbo.Shops', N'StripeCustomerId') IS NULL
BEGIN
  ALTER TABLE dbo.Shops ADD StripeCustomerId nvarchar(128) NULL;
END
GO

IF COL_LENGTH(N'dbo.Shops', N'SubscriptionStatus') IS NULL
BEGIN
  ALTER TABLE dbo.Shops ADD SubscriptionStatus nvarchar(32) NULL;
END
GO

IF COL_LENGTH(N'dbo.Shops', N'SubscriptionStatusAt') IS NULL
BEGIN
  ALTER TABLE dbo.Shops ADD SubscriptionStatusAt datetime2(3) NULL;
END
GO

IF COL_LENGTH(N'dbo.Shops', N'ConsecutiveUnpaidPeriods') IS NULL
BEGIN
  ALTER TABLE dbo.Shops ADD ConsecutiveUnpaidPeriods int NOT NULL
    CONSTRAINT DF_Shops_ConsecutiveUnpaidPeriods DEFAULT (0);
END
GO

IF OBJECT_ID(N'dbo.ShopInvoices', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ShopInvoices (
    InvoiceId       nvarchar(128)    NOT NULL CONSTRAINT PK_ShopInvoices PRIMARY KEY,
    ShopId          uniqueidentifier NOT NULL,
    PeriodStart     datetime2(3)     NULL,
    PeriodEnd       datetime2(3)     NULL,
    Status          nvarchar(32)     NOT NULL,
    SubscriptionId  nvarchar(128)    NULL,
    UpdatedAt       datetime2(3)     NOT NULL CONSTRAINT DF_ShopInvoices_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ShopInvoices_Shops FOREIGN KEY (ShopId) REFERENCES dbo.Shops(ShopId)
  );
  CREATE INDEX IX_ShopInvoices_ShopId ON dbo.ShopInvoices (ShopId, PeriodEnd);
END
GO

IF OBJECT_ID(N'dbo.StripeEvents', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.StripeEvents (
    EventId   nvarchar(128) NOT NULL CONSTRAINT PK_StripeEvents PRIMARY KEY,
    EventType nvarchar(128) NOT NULL,
    SeenAt    datetime2(3)  NOT NULL CONSTRAINT DF_StripeEvents_SeenAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_StripeEvents_SeenAt ON dbo.StripeEvents (SeenAt);
END
GO
