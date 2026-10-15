-- FR-216 / FR-235 prelude: Merchant Shops registry (a_search database only).
-- Apply to a_search (live) / a_search_sandbox (sandbox). Never modify madeiradb.
-- Credentials live in Secrets Manager; store a pointer only.

IF OBJECT_ID(N'dbo.Shops', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Shops (
    ShopId            uniqueidentifier NOT NULL CONSTRAINT PK_Shops PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    MerchantUserId    nvarchar(64)     NOT NULL,
    Env               nvarchar(16)     NOT NULL,
    Provider          nvarchar(32)     NOT NULL,
    ProviderShopId    nvarchar(128)    NOT NULL,
    ShopDomain        nvarchar(256)    NOT NULL,
    DisplayName       nvarchar(256)    NULL,
    ScopesJson        nvarchar(max)    NULL,
    Status            nvarchar(32)     NOT NULL CONSTRAINT DF_Shops_Status DEFAULT N'pending_payment',
    CredentialsSecretRef nvarchar(512) NULL,
    CreatedAt         datetime2(3)     NOT NULL CONSTRAINT DF_Shops_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt         datetime2(3)     NOT NULL CONSTRAINT DF_Shops_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Shops_MerchantEnvProviderShop UNIQUE (MerchantUserId, Env, Provider, ProviderShopId)
  );

  CREATE INDEX IX_Shops_MerchantEnv ON dbo.Shops (MerchantUserId, Env);
END
GO
