# SQL helpers for dbimport (walrus\asearch / a_search). Dot-source from Invoke-FolderDbImport.

Set-StrictMode -Version Latest

function New-DbImportConnection {
    param(
        [string]$Server = 'walrus\asearch',
        [string]$Database = 'a_search'
    )
    $cs = "Server=$Server;Database=$Database;Integrated Security=True;TrustServerCertificate=True;Connection Timeout=30"
    $conn = New-Object System.Data.SqlClient.SqlConnection $cs
    $conn.Open()
    return $conn
}

function Invoke-DbImportNonQuery {
    param(
        [Parameter(Mandatory = $true)][System.Data.SqlClient.SqlConnection]$Connection,
        [Parameter(Mandatory = $true)][string]$Sql,
        [hashtable]$Params = @{},
        [int]$TimeoutSec = 600
    )
    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    $cmd.CommandTimeout = $TimeoutSec
    foreach ($k in $Params.Keys) {
        [void]$cmd.Parameters.AddWithValue($k, $Params[$k])
    }
    return $cmd.ExecuteNonQuery()
}

function Get-DbImportScalar {
    param(
        [Parameter(Mandatory = $true)][System.Data.SqlClient.SqlConnection]$Connection,
        [Parameter(Mandatory = $true)][string]$Sql,
        [hashtable]$Params = @{}
    )
    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Sql
    $cmd.CommandTimeout = 120
    foreach ($k in $Params.Keys) {
        [void]$cmd.Parameters.AddWithValue($k, $Params[$k])
    }
    return $cmd.ExecuteScalar()
}

function Clip-DbImportNvarchar {
    param(
        [AllowNull()]$Value,
        [Parameter(Mandatory = $true)][int]$MaxLen
    )
    if ($null -eq $Value) { return [DBNull]::Value }
    $s = [string]$Value
    if ($s.Length -eq 0) { return [DBNull]::Value }
    if ($MaxLen -gt 0 -and $s.Length -gt $MaxLen) {
        return $s.Substring(0, $MaxLen)
    }
    return $s
}

function Test-DbImportSafetyGuard {
    param(
        [int]$ParsedCount,
        [int]$ExistingActiveCount,
        [int]$WouldRemoveCount,
        [double]$MaxRemoveRatio = 0.5
    )
    if ($ParsedCount -le 0) {
        return [pscustomobject]@{ Ok = $false; Code = 'empty_feed'; Message = 'empty or zero-part feed; refuse delete-all' }
    }
    if ($ExistingActiveCount -gt 0) {
        $ratio = $WouldRemoveCount / [double]$ExistingActiveCount
        if ($ratio -gt $MaxRemoveRatio) {
            return [pscustomobject]@{
                Ok      = $false
                Code    = 'remove_ratio_exceeded'
                Message = ("would remove {0}/{1} ({2:n2}) > {3}" -f $WouldRemoveCount, $ExistingActiveCount, $ratio, $MaxRemoveRatio)
            }
        }
    }
    return [pscustomobject]@{ Ok = $true; Code = 'ok'; Message = '' }
}

function Clear-DbImportPartsStaging {
    param($Connection, [string]$Source, [string]$FeedKey, [string]$Env)
    [void](Invoke-DbImportNonQuery -Connection $Connection -Sql @"
DELETE FROM dbo.PartsStaging WHERE Source=@Source AND FeedKey=@FeedKey AND Env=@Env
"@ -Params @{ '@Source' = $Source; '@FeedKey' = $FeedKey; '@Env' = $Env })
}

function Import-DbImportPartsRows {
    param(
        [Parameter(Mandatory = $true)][System.Data.SqlClient.SqlConnection]$Connection,
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$FeedKey,
        [Parameter(Mandatory = $true)][string]$Env,
        [Parameter(Mandatory = $true)][object[]]$Rows,
        [double]$MaxRemoveRatio = 0.5,
        [switch]$DryRun
    )
    $existing = [int](Get-DbImportScalar -Connection $Connection -Sql @"
SELECT COUNT(*) FROM dbo.Parts WHERE Source=@Source AND FeedKey=@FeedKey AND Env=@Env AND DeletedAt IS NULL
"@ -Params @{ '@Source' = $Source; '@FeedKey' = $FeedKey; '@Env' = $Env })

    $stagingIds = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($r in $Rows) { [void]$stagingIds.Add([string]$r.MerchantProductId) }

    $wouldRemove = 0
    if ($existing -gt 0) {
        $cmd = $Connection.CreateCommand()
        $cmd.CommandText = "SELECT MerchantProductId FROM dbo.Parts WHERE Source=@Source AND FeedKey=@FeedKey AND Env=@Env AND DeletedAt IS NULL"
        [void]$cmd.Parameters.AddWithValue('@Source', $Source)
        [void]$cmd.Parameters.AddWithValue('@FeedKey', $FeedKey)
        [void]$cmd.Parameters.AddWithValue('@Env', $Env)
        $rd = $cmd.ExecuteReader()
        while ($rd.Read()) {
            $id = [string]$rd.GetValue(0)
            if (-not $stagingIds.Contains($id)) { $wouldRemove++ }
        }
        $rd.Close()
    }

    $guard = Test-DbImportSafetyGuard -ParsedCount $Rows.Count -ExistingActiveCount $existing `
        -WouldRemoveCount $wouldRemove -MaxRemoveRatio $MaxRemoveRatio
    if (-not $guard.Ok) {
        throw ("{0}: {1}" -f $guard.Code, $guard.Message)
    }

    if ($DryRun) {
        return [pscustomobject]@{
            dryRun = $true; parsed = $Rows.Count; existing = $existing
            wouldRemove = $wouldRemove; upserted = 0; deleted = 0
        }
    }

    $runId = [int64](Get-DbImportScalar -Connection $Connection -Sql @"
INSERT INTO ingest.ImportRuns (Host, Mode, Status)
OUTPUT INSERTED.RunId
VALUES (@Host, N'run', N'running');
"@ -Params @{ '@Host' = $env:COMPUTERNAME })

    Clear-DbImportPartsStaging -Connection $Connection -Source $Source -FeedKey $FeedKey -Env $Env

    $table = New-Object System.Data.DataTable
    foreach ($col in @('Source', 'FeedKey', 'MerchantProductId', 'MerchantSku', 'Env', 'Title', 'Description', 'Url', 'ImageUrl', 'Currency', 'Stock', 'ContentHash')) {
        [void]$table.Columns.Add($col, [string])
    }
    $priceCol = $table.Columns.Add('Price', [decimal])
    $priceCol.AllowDBNull = $true
    $table.Columns['Source'].MaxLength = 64
    $table.Columns['FeedKey'].MaxLength = 128
    $table.Columns['MerchantProductId'].MaxLength = 256
    $table.Columns['MerchantSku'].MaxLength = 256
    $table.Columns['Env'].MaxLength = 16
    $table.Columns['Title'].MaxLength = 512
    $table.Columns['Url'].MaxLength = 2048
    $table.Columns['ImageUrl'].MaxLength = 2048
    $table.Columns['Currency'].MaxLength = 8
    $table.Columns['Stock'].MaxLength = 64
    $table.Columns['ContentHash'].MaxLength = 128

    foreach ($r in $Rows) {
        $row = $table.NewRow()
        $row['Source'] = Clip-DbImportNvarchar $Source 64
        $row['FeedKey'] = Clip-DbImportNvarchar $FeedKey 128
        $row['MerchantProductId'] = Clip-DbImportNvarchar $r.MerchantProductId 256
        $row['MerchantSku'] = Clip-DbImportNvarchar $r.MerchantSku 256
        $row['Env'] = Clip-DbImportNvarchar $Env 16
        $row['Title'] = Clip-DbImportNvarchar $r.Title 512
        $row['Description'] = Clip-DbImportNvarchar $r.Description 0
        $row['Url'] = Clip-DbImportNvarchar $r.Url 2048
        $row['ImageUrl'] = Clip-DbImportNvarchar $r.ImageUrl 2048
        if ($null -ne $r.Price -and "$($r.Price)" -ne '' -and "$($r.Price)" -ne 'null') {
            $row['Price'] = [decimal]$r.Price
        }
        else {
            $row['Price'] = [DBNull]::Value
        }
        $row['Currency'] = Clip-DbImportNvarchar $r.Currency 8
        $row['Stock'] = [DBNull]::Value
        $row['ContentHash'] = Clip-DbImportNvarchar $r.ContentHash 128
        $table.Rows.Add($row)
    }

    $bulk = New-Object System.Data.SqlClient.SqlBulkCopy $Connection
    $bulk.DestinationTableName = 'dbo.PartsStaging'
    $bulk.BatchSize = 2000
    $bulk.BulkCopyTimeout = 600
    foreach ($c in @('Source', 'FeedKey', 'MerchantProductId', 'MerchantSku', 'Env', 'Title', 'Description', 'Url', 'ImageUrl', 'Price', 'Currency', 'Stock', 'ContentHash')) {
        [void]$bulk.ColumnMappings.Add($c, $c)
    }
    $bulk.WriteToServer($table)

    [void](Invoke-DbImportNonQuery -Connection $Connection -TimeoutSec 600 -Sql @"
MERGE dbo.Parts AS t
USING (
  SELECT Source, FeedKey, MerchantProductId, MerchantSku, Env, Title, Description, Url, ImageUrl,
         Price, Currency, Stock, ContentHash
  FROM dbo.PartsStaging
  WHERE Source=@Source AND FeedKey=@FeedKey AND Env=@Env
) AS s
ON t.Source=s.Source AND t.FeedKey=s.FeedKey AND t.MerchantProductId=s.MerchantProductId AND t.Env=s.Env
WHEN MATCHED THEN UPDATE SET
  MerchantSku=s.MerchantSku, Title=s.Title, Description=s.Description, Url=s.Url, ImageUrl=s.ImageUrl,
  Price=s.Price, Currency=s.Currency, Stock=s.Stock, ContentHash=s.ContentHash,
  DeletedAt=NULL, LastSeenRunId=@RunId, UpdatedAt=SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET THEN INSERT
  (Source, FeedKey, MerchantProductId, MerchantSku, Env, Title, Description, Url, ImageUrl,
   Price, Currency, Stock, ContentHash, DeletedAt, LastSeenRunId)
  VALUES
  (s.Source, s.FeedKey, s.MerchantProductId, s.MerchantSku, s.Env, s.Title, s.Description, s.Url, s.ImageUrl,
   s.Price, s.Currency, s.Stock, s.ContentHash, NULL, @RunId);
"@ -Params @{ '@Source' = $Source; '@FeedKey' = $FeedKey; '@Env' = $Env; '@RunId' = $runId })

    $deleted = [int](Invoke-DbImportNonQuery -Connection $Connection -TimeoutSec 600 -Sql @"
UPDATE dbo.Parts
SET DeletedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
WHERE Source=@Source AND FeedKey=@FeedKey AND Env=@Env
  AND DeletedAt IS NULL
  AND MerchantProductId NOT IN (
    SELECT MerchantProductId FROM dbo.PartsStaging
    WHERE Source=@Source AND FeedKey=@FeedKey AND Env=@Env
  );
"@ -Params @{ '@Source' = $Source; '@FeedKey' = $FeedKey; '@Env' = $Env })

    Clear-DbImportPartsStaging -Connection $Connection -Source $Source -FeedKey $FeedKey -Env $Env

    [void](Invoke-DbImportNonQuery -Connection $Connection -Sql @"
INSERT INTO ingest.ImportRunFeeds (RunId, ProviderId, FeedKey, Status, RowsStaged, RowsInserted, RowsDeleted)
VALUES (@RunId, @ProviderId, @FeedKey, N'ok', @RowsStaged, @RowsInserted, @RowsDeleted);
"@ -Params @{
        '@RunId' = $runId; '@ProviderId' = $Source; '@FeedKey' = $FeedKey
        '@RowsStaged' = $Rows.Count; '@RowsInserted' = $Rows.Count; '@RowsDeleted' = $deleted
    })
    [void](Invoke-DbImportNonQuery -Connection $Connection -Sql @"
UPDATE ingest.ImportRuns SET EndedAt = SYSUTCDATETIME(), Status = N'ok', ExitCode = 0 WHERE RunId = @RunId;
"@ -Params @{ '@RunId' = $runId })

    return [pscustomobject]@{
        dryRun = $false; parsed = $Rows.Count; existing = $existing
        wouldRemove = $wouldRemove; upserted = $Rows.Count; deleted = $deleted
        runId = $runId
    }
}

function Import-DbImportOfferRows {
    param(
        [Parameter(Mandatory = $true)][System.Data.SqlClient.SqlConnection]$Connection,
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$FeedKey,
        [Parameter(Mandatory = $true)][string]$Env,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Rows,
        [switch]$DryRun
    )

    [void](Invoke-DbImportNonQuery -Connection $Connection -Sql @"
IF OBJECT_ID(N'dbo.AffiliateOffers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AffiliateOffers (
    Source nvarchar(64) NOT NULL,
    FeedKey nvarchar(128) NOT NULL,
    PromotionId nvarchar(64) NOT NULL,
    Env nvarchar(16) NOT NULL CONSTRAINT DF_AffiliateOffers_Env DEFAULT (N'live'),
    Type nvarchar(64) NULL,
    Title nvarchar(512) NULL,
    Description nvarchar(max) NULL,
    Terms nvarchar(max) NULL,
    Code nvarchar(128) NULL,
    Url nvarchar(2048) NULL,
    UrlTracking nvarchar(2048) NULL,
    StartDate datetime2(0) NULL,
    EndDate datetime2(0) NULL,
    Status nvarchar(64) NULL,
    Exclusive bit NOT NULL CONSTRAINT DF_AffiliateOffers_Exclusive DEFAULT (0),
    Attributable bit NOT NULL CONSTRAINT DF_AffiliateOffers_Attributable DEFAULT (0),
    RawJson nvarchar(max) NULL,
    DeletedAt datetime2(7) NULL,
    CreatedAt datetime2(7) NOT NULL CONSTRAINT DF_AffiliateOffers_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt datetime2(7) NOT NULL CONSTRAINT DF_AffiliateOffers_UpdatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_AffiliateOffers PRIMARY KEY CLUSTERED (Source, FeedKey, PromotionId, Env)
  );
END
"@)

    if ($DryRun) {
        return [pscustomobject]@{ dryRun = $true; parsed = $Rows.Count; upserted = 0; deleted = 0 }
    }

    [void](Invoke-DbImportNonQuery -Connection $Connection -Sql @"
IF OBJECT_ID('tempdb..#OfferBatch') IS NOT NULL DROP TABLE #OfferBatch;
CREATE TABLE #OfferBatch (
  PromotionId nvarchar(64) NOT NULL PRIMARY KEY,
  Type nvarchar(64) NULL,
  Title nvarchar(512) NULL,
  Description nvarchar(max) NULL,
  Terms nvarchar(max) NULL,
  Code nvarchar(128) NULL,
  Url nvarchar(2048) NULL,
  UrlTracking nvarchar(2048) NULL,
  StartDate datetime2(0) NULL,
  EndDate datetime2(0) NULL,
  Status nvarchar(64) NULL,
  Exclusive bit NOT NULL,
  Attributable bit NOT NULL,
  RawJson nvarchar(max) NULL
);
"@)

    if ($Rows.Count -gt 0) {
        $table = New-Object System.Data.DataTable
        [void]$table.Columns.Add('PromotionId', [string])
        [void]$table.Columns.Add('Type', [string])
        [void]$table.Columns.Add('Title', [string])
        [void]$table.Columns.Add('Description', [string])
        [void]$table.Columns.Add('Terms', [string])
        [void]$table.Columns.Add('Code', [string])
        [void]$table.Columns.Add('Url', [string])
        [void]$table.Columns.Add('UrlTracking', [string])
        $sd = $table.Columns.Add('StartDate', [datetime]); $sd.AllowDBNull = $true
        $ed = $table.Columns.Add('EndDate', [datetime]); $ed.AllowDBNull = $true
        [void]$table.Columns.Add('Status', [string])
        [void]$table.Columns.Add('Exclusive', [bool])
        [void]$table.Columns.Add('Attributable', [bool])
        [void]$table.Columns.Add('RawJson', [string])

        $table.Columns['PromotionId'].MaxLength = 64
        $table.Columns['Type'].MaxLength = 64
        $table.Columns['Title'].MaxLength = 512
        $table.Columns['Code'].MaxLength = 128
        $table.Columns['Url'].MaxLength = 2048
        $table.Columns['UrlTracking'].MaxLength = 2048
        $table.Columns['Status'].MaxLength = 64

        foreach ($r in $Rows) {
            $row = $table.NewRow()
            $row['PromotionId'] = Clip-DbImportNvarchar $r.PromotionId 64
            $row['Type'] = Clip-DbImportNvarchar $r.Type 64
            $row['Title'] = Clip-DbImportNvarchar $r.Title 512
            $row['Description'] = Clip-DbImportNvarchar $r.Description 0
            $row['Terms'] = Clip-DbImportNvarchar $r.Terms 0
            $row['Code'] = Clip-DbImportNvarchar $r.Code 128
            $row['Url'] = Clip-DbImportNvarchar $r.Url 2048
            $row['UrlTracking'] = Clip-DbImportNvarchar $r.UrlTracking 2048
            if ($r.StartDate) { $row['StartDate'] = [datetime]$r.StartDate } else { $row['StartDate'] = [DBNull]::Value }
            if ($r.EndDate) { $row['EndDate'] = [datetime]$r.EndDate } else { $row['EndDate'] = [DBNull]::Value }
            $row['Status'] = Clip-DbImportNvarchar $r.Status 64
            $row['Exclusive'] = [bool]$r.Exclusive
            $row['Attributable'] = [bool]$r.Attributable
            $row['RawJson'] = Clip-DbImportNvarchar $r.RawJson 0
            $table.Rows.Add($row)
        }
        $bulk = New-Object System.Data.SqlClient.SqlBulkCopy $Connection
        $bulk.DestinationTableName = '#OfferBatch'
        $bulk.BulkCopyTimeout = 120
        foreach ($c in @('PromotionId', 'Type', 'Title', 'Description', 'Terms', 'Code', 'Url', 'UrlTracking', 'StartDate', 'EndDate', 'Status', 'Exclusive', 'Attributable', 'RawJson')) {
            [void]$bulk.ColumnMappings.Add($c, $c)
        }
        $bulk.WriteToServer($table)
    }

    [void](Invoke-DbImportNonQuery -Connection $Connection -Sql @"
MERGE dbo.AffiliateOffers AS t
USING #OfferBatch AS s
ON t.Source=@Source AND t.FeedKey=@FeedKey AND t.PromotionId=s.PromotionId AND t.Env=@Env
WHEN MATCHED THEN UPDATE SET
  Type=s.Type, Title=s.Title, Description=s.Description, Terms=s.Terms, Code=s.Code,
  Url=s.Url, UrlTracking=s.UrlTracking, StartDate=s.StartDate, EndDate=s.EndDate,
  Status=s.Status, Exclusive=s.Exclusive, Attributable=s.Attributable, RawJson=s.RawJson,
  DeletedAt=NULL, UpdatedAt=SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET THEN INSERT
  (Source, FeedKey, PromotionId, Env, Type, Title, Description, Terms, Code, Url, UrlTracking,
   StartDate, EndDate, Status, Exclusive, Attributable, RawJson)
  VALUES
  (@Source, @FeedKey, s.PromotionId, @Env, s.Type, s.Title, s.Description, s.Terms, s.Code, s.Url, s.UrlTracking,
   s.StartDate, s.EndDate, s.Status, s.Exclusive, s.Attributable, s.RawJson);
"@ -Params @{ '@Source' = $Source; '@FeedKey' = $FeedKey; '@Env' = $Env })

    $deleted = [int](Invoke-DbImportNonQuery -Connection $Connection -Sql @"
UPDATE dbo.AffiliateOffers
SET DeletedAt=SYSUTCDATETIME(), UpdatedAt=SYSUTCDATETIME()
WHERE Source=@Source AND FeedKey=@FeedKey AND Env=@Env AND DeletedAt IS NULL
  AND PromotionId NOT IN (SELECT PromotionId FROM #OfferBatch);
"@ -Params @{ '@Source' = $Source; '@FeedKey' = $FeedKey; '@Env' = $Env })

    return [pscustomobject]@{
        dryRun = $false; parsed = $Rows.Count; upserted = $Rows.Count; deleted = $deleted
    }
}
