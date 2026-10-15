-- target: a_search
-- FR-248: provisioned Amazon Associates per-tenant tracking IDs (a_search only).
-- Apply to a_search (live) / a_search_sandbox (sandbox). Never modify madeiradb.

IF OBJECT_ID(N'dbo.AmazonTrackingIds', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AmazonTrackingIds (
    TrackingTag       nvarchar(128)    NOT NULL CONSTRAINT PK_AmazonTrackingIds PRIMARY KEY,
    TenantId          char(8)          NOT NULL,
    StorePrefix       nvarchar(64)     NOT NULL,
    ProvisionedAt     datetime2(3)     NOT NULL CONSTRAINT DF_AmazonTrackingIds_ProvisionedAt DEFAULT SYSUTCDATETIME(),
    AlertedAt50       datetime2(3)     NULL
  );

  CREATE INDEX IX_AmazonTrackingIds_TenantId ON dbo.AmazonTrackingIds (TenantId);
END
GO
