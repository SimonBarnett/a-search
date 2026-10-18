# Multi-region smoke + failover checklist (FR-194)

## Decision (LOCKED)

Operator checklist for active-passive multi-region (FR-190..193). Ties FR-144
`scripts/smoke-deploy.js` (optional `--region`). No chaos automation in CI.

## Checklist

1. **Deploy primary** (`eu-west-2` default) and note `SearchApiUrl` / custom domain.
2. **Deploy standby** (FR-191): `-c region=<standby> -c stage=standby -c includeRegionInNames=true`.
3. **Confirm region-local ResultsBucket** on both stacks (FR-192); SQL stays IONOS.
4. **Smoke primary** with fixture JWT:
   `node scripts/smoke-deploy.js --url <primary-SearchApiUrl> --jwt "$TOKEN" --region eu-west-2`
5. **Smoke standby** the same way with `--url <standby-SearchApiUrl> --region <standby-region>`.
6. **Simulate primary deny** (security group / DNS weight / temporary block - ops choice; not CI).
7. **Cutover DNS** per [multi-region-dns.md](multi-region-dns.md) (FR-193).
8. **Verify failover** accepts JWT `POST /search` via the public hostname (smoke against `<api-hostname>`).
9. **Fail back** when primary is healthy; re-smoke primary.
10. Record times / owners; never log JWT or secrets.

## Script flag

`--region <token>` labels the smoke run (also `A_SEARCH_SMOKE_REGION`).
If `--url` is omitted and `--region` is set, the script uses
`A_SEARCH_API_URL_<REGION>` (non-alnum stripped, uppercased) when present,
else `A_SEARCH_API_URL`.

## Out of scope

- Automated chaos in CI
- Buying domains / CDK DNS (FR-193)

## Related

- [multi-region.md](multi-region.md)
- [multi-region-dns.md](multi-region-dns.md)
- [docs/fr/FR-194.md](fr/FR-194.md)
- FR-144 `scripts/smoke-deploy.js`
