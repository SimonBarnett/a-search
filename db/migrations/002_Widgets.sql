-- target: a_search
-- FR-196 / FR-232 rule 3: Widgets registry (a_search / a_search_sandbox only).
-- Never madeiradb (FR-251).
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.Widgets', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Widgets (
    WidgetGuid          uniqueidentifier NOT NULL,
    CustomerNumber      bigint           NULL,
    Host                nvarchar(253)    NULL,
    Layout              nvarchar(16)     NOT NULL,
    CreatedVia          nvarchar(32)     NOT NULL,
    CreatedByUserId     nvarchar(64)     NULL,
    CreatedAt           datetime2(3)     NOT NULL
      CONSTRAINT DF_Widgets_CreatedAt DEFAULT (sysutcdatetime()),
    BoundAt             datetime2(3)     NULL,
    Status              nvarchar(16)     NOT NULL
      CONSTRAINT DF_Widgets_Status DEFAULT (N'active'),
    CONSTRAINT PK_Widgets PRIMARY KEY CLUSTERED (WidgetGuid),
    CONSTRAINT FK_Widgets_Customers FOREIGN KEY (CustomerNumber)
      REFERENCES dbo.Customers (CustomerNumber),
    CONSTRAINT CK_Widgets_Layout CHECK (
      Layout IN (N'horizontal', N'vertical', N'fullscreen')
    ),
    CONSTRAINT CK_Widgets_CreatedVia CHECK (
      CreatedVia IN (N'extension', N'smartcatalogue', N'clubmadeira', N'migration')
    ),
    CONSTRAINT CK_Widgets_Status CHECK (
      Status IN (N'active', N'removed')
    )
  );
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_Widgets_CustomerNumber_Status'
    AND object_id = OBJECT_ID(N'dbo.Widgets')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Widgets_CustomerNumber_Status
    ON dbo.Widgets (CustomerNumber, Status)
    INCLUDE (Host, Layout, WidgetGuid);
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_Widgets_Host_Status'
    AND object_id = OBJECT_ID(N'dbo.Widgets')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_Widgets_Host_Status
    ON dbo.Widgets (Host, Status);
END
GO
