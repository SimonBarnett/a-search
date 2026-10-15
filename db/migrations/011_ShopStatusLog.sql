-- target: a_search
-- FR-235 / #1349: Shop status machine columns + ShopStatusLog + global unique shop.
-- Apply to a_search (live) / a_search_sandbox (sandbox). Never apply these scripts to the legacy club database (FR-251).

-- Global unique (Env, Provider, ProviderShopId): one owner; reconnect same merchant refreshes.
IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_Shops_MerchantEnvProviderShop' AND object_id = OBJECT_ID(N'dbo.Shops')
)
BEGIN
  ALTER TABLE dbo.Shops DROP CONSTRAINT UQ_Shops_MerchantEnvProviderShop;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_Shops_EnvProviderShop' AND object_id = OBJECT_ID(N'dbo.Shops')
)
BEGIN
  ALTER TABLE dbo.Shops
    ADD CONSTRAINT UQ_Shops_EnvProviderShop UNIQUE (Env, Provider, ProviderShopId);
END
GO

IF COL_LENGTH(N'dbo.Shops', N'SuspendReason') IS NULL
BEGIN
  ALTER TABLE dbo.Shops ADD SuspendReason nvarchar(32) NULL;
END
GO

IF COL_LENGTH(N'dbo.Shops', N'StripeSubscriptionId') IS NULL
BEGIN
  ALTER TABLE dbo.Shops ADD StripeSubscriptionId nvarchar(128) NULL;
END
GO

IF COL_LENGTH(N'dbo.Shops', N'LiveAt') IS NULL
BEGIN
  ALTER TABLE dbo.Shops ADD LiveAt datetime2(3) NULL;
END
GO

IF COL_LENGTH(N'dbo.Shops', N'StatusChangedAt') IS NULL
BEGIN
  ALTER TABLE dbo.Shops ADD StatusChangedAt datetime2(3) NULL;
END
GO

IF OBJECT_ID(N'dbo.ShopStatusLog', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ShopStatusLog (
    LogId        bigint         NOT NULL IDENTITY(1,1) CONSTRAINT PK_ShopStatusLog PRIMARY KEY,
    ShopId       uniqueidentifier NOT NULL,
    FromStatus   nvarchar(32)   NOT NULL,
    ToStatus     nvarchar(32)   NOT NULL,
    Reason       nvarchar(32)   NULL,
    At           datetime2(3)   NOT NULL CONSTRAINT DF_ShopStatusLog_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ShopStatusLog_Shops FOREIGN KEY (ShopId) REFERENCES dbo.Shops(ShopId)
  );
  CREATE INDEX IX_ShopStatusLog_ShopId ON dbo.ShopStatusLog (ShopId, At);
END
GO