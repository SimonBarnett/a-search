-- a_search on walrus\asearch
-- Affiliate network offers / vouchers (Awin coupons.json and peers).
IF OBJECT_ID(N'dbo.AffiliateOffers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AffiliateOffers (
    Source           nvarchar(64)  NOT NULL,
    FeedKey          nvarchar(128) NOT NULL,
    PromotionId      nvarchar(64)  NOT NULL,
    Env              nvarchar(16)  NOT NULL CONSTRAINT DF_AffiliateOffers_Env DEFAULT (N'live'),
    Type             nvarchar(64)  NULL,
    Title            nvarchar(512) NULL,
    Description      nvarchar(max) NULL,
    Terms            nvarchar(max) NULL,
    Code             nvarchar(128) NULL,
    Url              nvarchar(2048) NULL,
    UrlTracking      nvarchar(2048) NULL,
    StartDate        datetime2(0)  NULL,
    EndDate          datetime2(0)  NULL,
    Status           nvarchar(64)  NULL,
    Exclusive        bit           NOT NULL CONSTRAINT DF_AffiliateOffers_Exclusive DEFAULT (0),
    Attributable     bit           NOT NULL CONSTRAINT DF_AffiliateOffers_Attributable DEFAULT (0),
    RawJson          nvarchar(max) NULL,
    DeletedAt        datetime2(7)  NULL,
    CreatedAt        datetime2(7)  NOT NULL CONSTRAINT DF_AffiliateOffers_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt        datetime2(7)  NOT NULL CONSTRAINT DF_AffiliateOffers_UpdatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_AffiliateOffers PRIMARY KEY CLUSTERED (Source, FeedKey, PromotionId, Env)
  );
  CREATE INDEX IX_AffiliateOffers_Active
    ON dbo.AffiliateOffers (Source, FeedKey, Env)
    WHERE DeletedAt IS NULL;
END
GO
