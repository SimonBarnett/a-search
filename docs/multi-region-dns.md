# Multi-region DNS / custom domain failover (FR-193)

## Decision (LOCKED)

**Docs-first Route53 (or external DNS) failover runbook** for active-passive (FR-190).
No CDK DNS constructs in this FR. Placeholders only - never commit real domains or secrets.

| Item | Lock |
|------|------|
| Topology | Active-passive: DNS points at **primary** API until cutover. |
| Primary | HTTP API in `eu-west-2` (default). Record target = primary execute-api / custom-domain endpoint. |
| Standby | Second stack (FR-191) in another region; health-checked **failover** record (or weighted/manual cutover). |
| Health check | HTTPS GET to a cheap authenticated or public health path on the API (operator chooses path; must not leak secrets). |
| TTL | Keep low enough for cutover (e.g. 60s) during drills; document production TTL separately. |
| Custom domain | Optional ACM + API Gateway custom domain **per region**; DNS alias/failover chooses which regional domain is live. |
| SQL | Failover does **not** move madeiradb/IONOS; SQL stays single-region (FR-190). |

## Placeholders

| Placeholder | Meaning |
|-------------|---------|
| `<api-hostname>` | Public hostname clients call (e.g. `api.example.test`) |
| `<primary-api-target>` | Primary regional API invoke URL or regional custom domain |
| `<standby-api-target>` | Standby regional API invoke URL or regional custom domain |
| `<health-path>` | Path used by DNS health checks (e.g. `/health` or documented selftest) |

## Runbook (cutover)

1. Confirm standby stack is deployed and healthy (FR-191 / FR-194 smoke).
2. Confirm standby `ResultsBucket` is ready (FR-192 region-local).
3. Flip DNS failover (or raise standby weight) from `<primary-api-target>` to `<standby-api-target>`.
4. Verify clients hit standby; watch DLQ / entry logs.
5. Keep SQL connection strings pointing at IONOS (unchanged).
6. Fail back by reversing DNS when primary is restored.

## Out of scope

- Buying or registering domains
- CDK Route53 / ACM resources (later FR if operators ask)
- Multi-region SQL

## Related

- [multi-region.md](multi-region.md) (FR-190..192)
- [deploy.md](deploy.md)
- [docs/fr/FR-193.md](fr/FR-193.md)
