# Ops runbook: create sandbox DB + apply a-search DDL

**FR-146.** Operators create the separate sandbox database on the IONOS MSSQL
instance and apply a-search-owned T-SQL to **both** live and sandbox databases.
Runtime Lambdas **never** run DDL.

Canonical env rules: [environments.md](../environments.md) (FR-119 / FR-121).
Parts scripts: [maintainer/sql/README.md](../../maintainer/sql/README.md) (FR-120).

## Placeholders (no secrets in git)

| Placeholder | Meaning |
|-------------|---------|
| `<mssql-host>` | SQL Server host from deploy / [environments.md](../environments.md) MSSQL target (do not invent a new host here) |
| `<sandbox-mssql-database>` | Separate sandbox database name. **Recommended default:** `a_search_sandbox` unless the operator overrides |
| Live database | Always `madeiradb` |

Use Windows integrated auth (`sqlcmd -E`) or a deploy-time SQL login supplied
out of band. **Never** commit passwords, connection strings, or SAS tokens.

## 1. Create the sandbox database (once)

On `<mssql-host>`, as a sysadmin / dbcreator:

```sql
-- Recommended name unless operator overrides (FR-146)
IF DB_ID(N'a_search_sandbox') IS NULL
BEGIN
  CREATE DATABASE [a_search_sandbox];
END
GO
ALTER DATABASE [a_search_sandbox] SET RECOVERY SIMPLE;
GO
```

Why **SIMPLE**: instance `model` may be FULL; a FULL sandbox log will grow
without a log-backup chain. Live `madeiradb` is already SIMPLE
([environments.md](../environments.md)).

If the operator chose a different name, substitute it everywhere and set
sandbox deploy `MSSQL_DATABASE` / Secrets Manager JSON accordingly.

Confirm:

```text
sqlcmd -S <mssql-host> -E -Q "SELECT name, recovery_model_desc FROM sys.databases WHERE name IN ('madeiradb','a_search_sandbox')"
```

## 2. Apply Parts maintainer DDL (live + sandbox)

Scripts (order matters; each is idempotent):

1. `maintainer/sql/001_PartFeedKeys.sql`
2. `maintainer/sql/002_Parts.sql`
3. `maintainer/sql/003_PartsStaging.sql`

`004_MergeParts.sql` / `005_DeleteMissingParts.sql` are runtime merge helpers
documented under maintainer SQL — apply only if ops runbooks for those
objects require them; FR-120 migrate-once core is 001–003.

```text
sqlcmd -S <mssql-host> -d madeiradb -E -i maintainer/sql/001_PartFeedKeys.sql
sqlcmd -S <mssql-host> -d madeiradb -E -i maintainer/sql/002_Parts.sql
sqlcmd -S <mssql-host> -d madeiradb -E -i maintainer/sql/003_PartsStaging.sql

sqlcmd -S <mssql-host> -d a_search_sandbox -E -i maintainer/sql/001_PartFeedKeys.sql
sqlcmd -S <mssql-host> -d a_search_sandbox -E -i maintainer/sql/002_Parts.sql
sqlcmd -S <mssql-host> -d a_search_sandbox -E -i maintainer/sql/003_PartsStaging.sql
```

(Replace `a_search_sandbox` if the operator overrode the name.)

## 3. Optional product docs SQL (live)

Scripts under `docs/sql/` are **not** the Parts pipeline. Example:

- `docs/sql/001_ImpactPendingOnboard.sql` — Impact pending-onboard queue (FR-051a)

Apply to `madeiradb` (and sandbox only if sandbox Impact drain is required):

```text
sqlcmd -S <mssql-host> -d madeiradb -E -i docs/sql/001_ImpactPendingOnboard.sql
```

See [docs/sql/README.md](README.md) and [impact-pending-onboard-queue.md](../impact-pending-onboard-queue.md).

## 4. Deploy wiring check

| Env | `MSSQL_DATABASE` (or secret JSON database field) |
|-----|--------------------------------------------------|
| live | `madeiradb` |
| sandbox | `a_search_sandbox` (or the operator override) |

Fail-closed: sandbox workers/maintainer must **never** write into `madeiradb`.
Rows inside a-search Parts tables still use `Env='live'|'sandbox'` check
constraints inside each database.

## 5. Backup / jobs (ops note)

Nightly `Madeira_Nightly_Maintenance` currently covers **`madeiradb`**. Either
extend that job to include the sandbox DB, or document sandbox as rebuildable
from this runbook with no backup. Point-in-time restore is not available
(SIMPLE recovery).

## Out of scope

- Agents executing DDL on IONOS from a worker seat
- Inventing SQL passwords or committing real connection strings
- Enabling stay-dark providers

## Related

- FR-121 LOCKED separate sandbox DB: [environments.md](../environments.md)
- Deploy secrets: [deploy.md](../deploy.md) / [secrets-matrix.md](../secrets-matrix.md)
- Release gap row: Sandbox DB create + DDL apply runbook
