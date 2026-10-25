-- target: a_search
-- FR #4943: store GitHub issue number on ingest.Failures (IssueUrl already present).

IF COL_LENGTH(N'ingest.Failures', N'IssueNumber') IS NULL
BEGIN
  ALTER TABLE ingest.Failures ADD IssueNumber int NULL;
END
GO
