# a-search docs SQL notes

Migrate-once scripts referenced from product docs (not the Parts maintainer
pipeline under `maintainer/sql/`).

| Script | Purpose |
|--------|---------|
| `001_ImpactPendingOnboard.sql` | FR-051a Impact pending-onboard queue when join API is UNKNOWN |
| [apply-ddl-runbook.md](apply-ddl-runbook.md) | FR-146 ops: create sandbox DB + apply `maintainer/sql` to live and sandbox |

See `docs/impact-pending-onboard-queue.md` for env keys and drain semantics.
Sandbox DB create + Parts DDL: [apply-ddl-runbook.md](apply-ddl-runbook.md).
