# Impact pending-onboard queue (FR-051a)

Impact local onboarding needs a drain source when the Impact
catalogue-join / partner-discovery **API is UNKNOWN**. Until that API is
LOCKED, the scheduled onboarding agent drains a MSSQL **pending onboard**
queue so `remaining` can reach **0** and the schedule self-closes
(same contract as `docs/onboarding-agents.md` when present).

Runner code is **out of scope** here (FR-051b+). This note locks the table
shape and env keys only.

## Env keys

Reuse the Impact provider MSSQL connection (same box / DB as Parts search).
Never commit secrets; keep them in `providers/local/impact/.env` or the
onboarding CWD `.env`.

| Key | Required | Meaning |
|-----|----------|---------|
| `A_SEARCH_ENV` | yes | `live` or `sandbox` — filters queue rows by `Env` |
| `MSSQL_SERVER` | yes | SQL host |
| `MSSQL_DATABASE` | yes | Database that holds the pending queue |
| `MSSQL_USER` | when not trusted | SQL login |
| `MSSQL_PASSWORD` | when not trusted | SQL password (never log / never intake) |
| `MSSQL_TRUSTED_CONNECTION` | alt | `true` for integrated auth (skips user/password) |
| `MSSQL_ENCRYPT` | no | default `true` |
| `MSSQL_TRUST_SERVER_CERTIFICATE` | no | default `true` on lab boxes |
| `MSSQL_DOMAIN` | no | optional NTLM domain |
| `IMPACT_PENDING_ONBOARD_TABLE` | no | override table name; default `dbo.ImpactPendingOnboard` |
| `ONBOARDING_MAX_ITERATIONS` | no | drain safety cap (shared drain helper when present) |

Optional Impact API placeholders (future FR-051 slices; unused while API UNKNOWN):

| Key | Meaning |
|-----|---------|
| `IMPACT_ACCOUNT_SID` | Impact account sid (when API LOCKED) |
| `IMPACT_AUTH_TOKEN` | Impact auth token (when API LOCKED) |

## DDL note (migrate-once)

Canonical script: `docs/sql/001_ImpactPendingOnboard.sql`.

Shape (summary):

```sql
CREATE TABLE dbo.ImpactPendingOnboard (
  Id              bigint IDENTITY(1,1) NOT NULL,
  Env             nvarchar(16)  NOT NULL,   -- live | sandbox
  MerchantId      nvarchar(128) NOT NULL,   -- Impact campaign / partner id
  MerchantName    nvarchar(512) NULL,
  Status          nvarchar(32)  NOT NULL,   -- pending | processing | done | error
  EnqueuedAt      datetime2(3)  NOT NULL,
  ProcessedAt     datetime2(3)  NULL,
  LastError       nvarchar(max) NULL,
  Notes           nvarchar(1024) NULL,
  CONSTRAINT PK_ImpactPendingOnboard PRIMARY KEY CLUSTERED (Id),
  CONSTRAINT CK_ImpactPendingOnboard_Env
    CHECK (Env IN (N'live', N'sandbox')),
  CONSTRAINT CK_ImpactPendingOnboard_Status
    CHECK (Status IN (N'pending', N'processing', N'done', N'error'))
);
-- IX: (Env, Status) INCLUDE (MerchantId, MerchantName, EnqueuedAt)
-- UQ optional: (Env, MerchantId) WHERE Status IN (pending, processing)
```

Apply with migrate-once / `IF OBJECT_ID … IS NULL` (same style as
`maintainer/sql/`).

## Drain semantics (documentation only)

1. Read rows: `Env = @env` AND `Status = N'pending'` (batch size injectable).
2. Mark `processing` → do onboard work (later FRs) → `done` or `error` + `LastError`.
3. `remaining` = count of rows still `pending` (and optionally `processing`) for `@env`.
4. When **`remaining === 0`**, drain exits **0** (schedule complete).

Empty queue is success: schedule still self-closes without a live Impact join API.

## Related

- Parent omnibus (closed): `docs/fr/FR-051.md`
- Children: FR-051b runOnce drain, FR-051c signup rows, FR-051d skillbook
- Shared onboarding contract: `docs/onboarding-agents.md` (FR-049a when merged)
- Clubscan parity (Awin has a live join API; Impact uses this queue while UNKNOWN):
  https://github.com/SimonBarnett/AWS/tree/main/Lambdas/madeira-awin-clubscan
