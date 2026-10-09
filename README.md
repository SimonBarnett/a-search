# a-search

JWT-authenticated search entry for Club Madeira affiliate / local parts
discovery. One `POST /search` accepts the job (**HTTP 200**) and fans out
offline work to per-provider SQS queues. Local parts live in MSSQL; a
scheduled maintainer refreshes CSV/feeds. Live and sandbox are isolated.
Results land in S3 and are visible on the SQL host via an rclone mapped drive.

## Docs

- [Vision](docs/vision.md) (LOCKED)
- [Endpoint](docs/endpoint-search.md) (`POST /search`)
- [Performance endpoint](docs/endpoint-performance.md) (FR-053a -- clicks / visits / sales for JWT `userId`)
- [Selftest endpoint](docs/endpoint-selftest.md) (FR-059a -- provider status + intake on fail)
- [Selftest mocks](docs/mocks/selftest.html) (FR-059n -- key / [empty](docs/mocks/selftest-empty.html) / [error](docs/mocks/selftest-error.html))
- [Performance mocks](docs/mocks/performance.html) (FR-053g -- key / [empty](docs/mocks/performance-empty.html) / [error](docs/mocks/performance-error.html))
- [S3 mapping schema](docs/s3-mapping.md) (FR-054a -- `env` / `userId` / `source` / `token` / `s3Key`)
- [Environments](docs/environments.md)
- [SQS pacing](docs/sqs-pacing.md) (FR-058a -- prevent provider 407/429)
- [rclone results mount](docs/rclone-results.md) (SQL host `A_SEARCH_RCLONE_ROOT`)
- [madeiradb data model](docs/data-model.md) (FR-113 inventory / FR-116 Club scans / FR-117 Integrity orphan-safe reads)
- [Identity (8-char user / partner / club codes)](docs/identity.md) (FR-114)
- [Catalog / product / ASIN model](docs/catalog-model.md) (FR-115 - madeiradb map)
- [Product result schema](docs/result-schema.md) (FR-042)
- [Parts maintainer](docs/parts-maintainer.md)
- [Provider shortlist](docs/provider-shortlist.md)
- [Phase-2 providers](docs/phase2-providers.md) (FR-061 -- stay-dark until credentials)
- [Phase-3 enable one provider](docs/phase3-enable-provider.md) (FR-126 -- ritual template; does not enable anyone)
- [Deploy playbook](docs/deploy.md) (FR-140 -- bootstrap, secrets, cdk deploy, SearchApiUrl, smoke, rclone)
- [AWS installable v0.1 DoD](docs/release-installable.md) (FR-128 -- CI, cdk deploy, secrets, S3, smoke, VERSION; stay-dark OOS)
- [Release checklist](docs/release-checklist.md) (FR-145 -- `VERSION` / tag `v0.1.0` pre-tag gates; Plan/UAT cuts the GitHub Release)
- [Add a source](docs/add-source.md) (checklist -- registry `enabled`, no `entry/` core edits)
- [Skillbook layout](docs/skillbook-layout.md)
- [Shared layer](docs/shared-layer.md) (`shared/` -> `/opt/nodejs/a-search`)
- [Tracked links](docs/tracked-links.md) (FR-057 -- JWT `userId` tenant + provider `.env` account)
- [Intake on exception](docs/intake-on-exception.md) (FR-048 -- entry/worker/maintainer/onboarding)
- [Onboarding agents](docs/onboarding-agents.md) (FR-049a -- drain until `remaining=0` + signup fields)
- [Daily report signups](docs/daily-report-signups.md) (FR-052a -- clubscan field map)
- [Partner removal cascade](docs/partner-removal.md) (FR-118 -- DBA madeiradb + S3 dry-run)
- [Legacy madeira-awin-clubscan](https://github.com/SimonBarnett/AWS/tree/main/Lambdas/madeira-awin-clubscan) (daily onboarding / signup report -- read-only; HTML email stays in AWS until cutover)
- [Impact pending-onboard queue](docs/impact-pending-onboard-queue.md) (FR-051a -- API UNKNOWN fallback)
- [Provider onboarding skills](docs/provider-onboarding-skills.md) (FR-060a)
- [Phase 2 stub providers (stay dark)](docs/feature-request-phase2-all-providers-2026-10-08.md) (FR-061..112 / issues #614-#665)
- [Phase 2 FR index](docs/fr/ISSUED-PHASE2.md)
- [Functional spec](docs/functional-spec.md)

## Agent caller skill

`.grok/skills/a-search-endpoint/SKILL.md` -- how an agent calls the API.

## Shape

**service** -- Node.js 20+ on AWS. Plan pack validated with
`validate-vision-pack.py`.

## Develop

Requires **Node.js 20+**. From a clean clone:

```bash
npm install
npm test
```

`npm test` runs `node scripts/run-tests.js`, which walks `tests/**/*.test.js` and invokes `node --test` (quoted globs break Linux CI).

After Phase 1b vision edits (Success S10â€“S16), confirm the pack still validates:

```bash
npm run validate:vision
```

That runs `tests/fr055j-validate-vision-pack.test.js`, which invokes
`validate-vision-pack.py` against `docs/vision.md` (exit 0). Override the
script path with env `VALIDATE_VISION_PACK` when the default
`C:\ai\bob\plan\tools\validate-vision-pack.py` is not on the box.

## Infrastructure (CDK)

Skeleton under `cdk/` (FR-023): entry Lambda + `a-search-amazon-live` /
`a-search-amazon-sandbox` queues. See [`cdk/README.md`](cdk/README.md).

```bash
npm install
npm run synth
```

`npm run synth` must exit 0. Deploy: `npm run deploy -- -c account=ACCOUNT_ID -c region=eu-west-2` (FR-141; see [cdk/README.md](cdk/README.md)).

## Feature requests

Initial build is split into small, testable GitHub issues labeled
`feature-request`. Prefer one PR per issue.
