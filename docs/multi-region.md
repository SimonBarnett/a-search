# Multi-region strategy (FR-190)

## Decision (LOCKED)

**Active-passive failover** with a single primary AWS region.

| Item | Lock |
|------|------|
| Topology | **Active-passive** (not active-active). One primary serves traffic; a standby region can be deployed and warmed but does not take dual-write traffic. |
| Primary region default | `eu-west-2` (matches `docs/deploy.md` / CDK context). |
| Standby | Second region via FR-191+ (`region` / `stage` context). Cutover is an ops runbook (FR-193 DNS / FR-194 smoke). |
| HTTP API / Lambdas / SQS | Regional stacks; standby is cold or warm but not dual-active for the same env+stage. |
| S3 results | **Region-local** ResultsBucket per stack (FR-192 LOCKED). No S3 CRR. Primary owns live results until cutover; standby stack has its own bucket. |
| Secrets | Replicate or re-seed into the standby stack as needed for failover; never commit secret values. |
| MSSQL / madeiradb | **Stays single-region on IONOS** (`WIN-MPRE8VI4U6U` / `madeiradb`). Do **not** assume SQL multi-region or dual-write. AWS regions fail over independently of the SQL host. |

### Why not active-active

Club Madeira **SQL is a single IONOS instance**. Active-active AWS would still funnel local/MSSQL-backed providers and identity tables through one SQL path, creating split-brain risk and double-write complexity without a SQL story. Active-passive keeps one primary AWS footprint and an explicit failover runbook.

### Success (this wave)

| # | Criterion |
|---|-----------|
| M1 | `docs/multi-region.md` states Decision (LOCKED) active-passive + `eu-west-2` primary. |
| M2 | Doc calls out SQL/madeiradb stays single-region IONOS. |
| M3 | Pin test asserts those needles (FR-190). |
| M4 | Second-region stack / DNS / S3 details deferred to FR-191..194. |

## Out of scope here

- Implementing the second-region CDK stack (FR-191)
- S3 replication choice (FR-192)
- DNS / custom domain failover (FR-193)
- Smoke / failover checklist (FR-194)

## Related

- [docs/deploy.md](deploy.md) (primary `eu-west-2`)
- [docs/environments.md](environments.md) (IONOS SQL)
- [docs/fr/FR-190.md](fr/FR-190.md)

### Second-region stack (FR-191)

Use `-c region=` + `-c stage=` + `-c includeRegionInNames=true` (see [deploy.md](deploy.md)).

## Results bucket strategy (FR-192)

Decision (LOCKED): **region-local** S3 ResultsBucket per regional stack (CDK auto-named).
Do **not** enable Cross-Region Replication (CRR) for a-search results under active-passive.

| Concern | Lock |
|---------|------|
| Primary | Stack in `eu-west-2` owns the live `ResultsBucket` + `live/` / `sandbox/` key prefixes (FR-124). |
| Standby | FR-191 second stack creates a **separate** regional bucket; workers there write locally after cutover. |
| CRR | Not used (cost/complexity; dual-read ambiguity). Optional future FR only. |
| SQL / rclone | IONOS SQL host and any rclone sync stay **primary-region oriented**; do not assume SQL multi-region. |

### DNS failover (FR-193)

See [multi-region-dns.md](multi-region-dns.md) for the Route53/external DNS cutover runbook (docs-first; no CDK DNS in FR-193).
