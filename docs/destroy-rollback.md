# Destroy / rollback playbook (FR-163)

Safe teardown of an a-search AWS installable stack (`ASearchStack`) after
[deploy.md](deploy.md). This is an **ops** playbook. Automated destroy from CI
is out of scope.

**Never** put secret values, JWTs, connection strings, or real account IDs in
this doc or in git.

## What `cdk destroy` removes

`npx cdk destroy --app "node cdk/bin/a-search.js" ASearchStack` (with the same
`-c account` / `-c region` / secret ARN context as deploy) deletes CloudFormation
resources the stack owns, including:

| Resource class | Examples | Notes |
|----------------|----------|--------|
| SQS queues + DLQs | `a-search-{source}-{live\|sandbox}`, `*-dlq` | Emptied/deleted with the stack (FR-142 / FR-162) |
| Lambda functions + event sources | entry, workers, maintainer, onboarding | Code assets go with the functions |
| HTTP API | SearchApiUrl routes (`/search`, `/selftest`, `/account/performance`) | Base URL stops resolving after destroy |
| CloudWatch Log groups | Lambda log groups | Stack uses `RemovalPolicy.RETAIN` on log groups - **groups may remain** after destroy (orphans; delete manually if required) |
| CloudWatch alarms / SNS | DLQ depth alarms (FR-143) | Removed with the stack when owned by it |
| Stack outputs | SearchApiUrl, queue URLs, bucket name | Gone with the stack |

Queues do not need a special empty step before destroy; CloudFormation deletes
them. Large backlog is ops concern only if you need to drain for forensics
first.

## Results bucket: RETAIN (LOCKED)

The results S3 bucket (`S3_RESULTS_BUCKET` / stack `ResultsBucketName`) is
created with:

- `removalPolicy: cdk.RemovalPolicy.RETAIN`
- `autoDeleteObjects: false`

So **`cdk destroy` does not delete the bucket or its objects** (results,
`{env}/_mapping/`, `{env}/_stats/`, `{env}/_reports/`, signups). After destroy
the bucket remains in the account as an orphaned resource until ops empties and
deletes it deliberately.

| Policy | Effect on destroy |
|--------|-------------------|
| **RETAIN** (current LOCKED) | Bucket + objects survive; stack record removed |
| DESTROY + auto-delete | Would wipe results on destroy - **not** used for v0.1 |

To remove retained data later (ops only):

1. Confirm no other stack / rclone consumer still needs the bucket.
2. Empty prefixes (or whole bucket) via console/CLI.
3. Delete the bucket.

Do not flip RemovalPolicy to DESTROY in product git without an explicit FR.

## What ops must retain (outside the stack)

These are **not** deleted by `cdk destroy` and must stay unless a separate
ops decision says otherwise:

| Asset | Why retain |
|-------|------------|
| MSSQL live + sandbox databases / DDL | Tenant data, parts, Club Madeira tables - see [sql/apply-ddl-runbook.md](sql/apply-ddl-runbook.md) |
| Secrets Manager secrets (JWT, MSSQL, provider ARNs) | Referenced by ARN context; often shared across deploys; never commit values ([secrets-matrix.md](secrets-matrix.md)) |
| Login / JWT issuer configuration | Outside a-search product stack |
| rclone mount config on the SQL host | `A_SEARCH_RCLONE_ROOT` - unmount only after bucket decision ([rclone-results.md](rclone-results.md)) |
| Firewall / egress allowlists (FR-149) | Edge rules are ops-owned |

## Order of operations (safe teardown)

1. **Stop callers** - remove SearchApiUrl from agent env (`A_SEARCH_URL_*` /
   `A_SEARCH_API_URL`); pause Club Madeira / agent jobs.
2. **Optional drain** - let in-flight SQS messages finish or accept loss; note
   DLQ contents if you need failure forensics (FR-143).
3. **Unmount or idle rclone** on the SQL host so open handles do not hold the
   bucket (optional but recommended before emptying).
4. **Destroy the stack** with the same account/region/context as deploy:

```bash
npm run stage-entry
npx --no-install cdk destroy --app "node cdk/bin/a-search.js" ASearchStack \
  -c account=ACCOUNT_ID \
  -c region=eu-west-2 \
  -c requireDeployEnv=true
# plus the same jwtSecretArn / mssqlSecretArn / *ProviderSecretArn context as deploy
```

Approve the destroy prompt. Do **not** run this from CI without an explicit
approval gate (OOS).

5. **Confirm SearchApiUrl is dead** - HTTP calls should fail DNS/connect.
6. **Decide on the retained bucket** - keep for rollback redeploy, or empty +
   delete after backup.
7. **Leave SQL + secrets** unless a separate decommission ticket covers them.
8. **Redeploy** (rollback) via [deploy.md](deploy.md) if needed; point rclone at
   the retained or new bucket name from outputs.

## Rollback (redeploy after destroy)

1. Follow [deploy.md](deploy.md) bootstrap -> secrets context -> `cdk deploy`.
2. If the results bucket was **retained**, either import/adopt it in a follow-up
   FR or create a fresh bucket (current stack always creates with RETAIN) and
   re-point rclone / `S3_RESULTS_BUCKET` consumers to the new name.
3. Run FR-144 smoke (`npm run smoke-deploy`) against the new SearchApiUrl.
4. Re-enable agent env URLs only after smoke passes.

## Out of scope

- Automated destroy from CI / PR
- Changing bucket RemovalPolicy to DESTROY
- Dropping MSSQL databases or Secrets Manager secrets
- Stay-dark provider enablement

## Related

- Deploy: [deploy.md](deploy.md) (FR-140)
- Bucket: FR-129 / FR-154 (`RemovalPolicy.RETAIN`, BlockPublicAccess, SSE)
- Queues: FR-142 DLQ, FR-162 SQS SSE
- Smoke: FR-144 / `scripts/smoke-deploy.js`
- Pin: `tests/fr163-destroy-rollback-docs.test.js`
