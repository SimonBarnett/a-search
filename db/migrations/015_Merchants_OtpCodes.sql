-- FR-228 / #1238: Merchants (verified phone) + OtpCodes (hashed secrets).
-- Apply to a_search (live) / a_search_sandbox (sandbox). Never modify madeiradb.
-- Do not write SystemOTPs in madeiradb (a-search owns OtpCodes here).

IF OBJECT_ID(N'dbo.Merchants', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Merchants (
    MerchantUserId    char(8)          NOT NULL CONSTRAINT PK_Merchants PRIMARY KEY,
    VerifiedPhoneE164 nvarchar(20)     NULL,
    VerifiedEmail     nvarchar(320)    NULL,
    CreatedAt         datetime2(3)     NOT NULL CONSTRAINT DF_Merchants_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt         datetime2(3)     NOT NULL CONSTRAINT DF_Merchants_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END
GO

IF OBJECT_ID(N'dbo.OtpCodes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.OtpCodes (
    OtpId             uniqueidentifier NOT NULL CONSTRAINT PK_OtpCodes PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Channel           nvarchar(16)     NOT NULL, -- email | sms
    Destination       nvarchar(320)    NOT NULL, -- email or E.164 phone
    Kind              nvarchar(16)     NOT NULL, -- otp | magic
    SecretHash        char(64)         NOT NULL, -- sha256 hex
    ExpiresAt         datetime2(3)     NOT NULL,
    Attempts          int              NOT NULL CONSTRAINT DF_OtpCodes_Attempts DEFAULT 0,
    MaxAttempts       int              NOT NULL CONSTRAINT DF_OtpCodes_MaxAttempts DEFAULT 5,
    UsedAt            datetime2(3)     NULL,
    CreatedAt         datetime2(3)     NOT NULL CONSTRAINT DF_OtpCodes_CreatedAt DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_OtpCodes_ChannelDest ON dbo.OtpCodes (Channel, Destination);
END
GO
