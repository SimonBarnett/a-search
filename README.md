# a-search

JWT-authenticated search entry for Club Madeira affiliate / local parts
discovery. One `POST /search` accepts the job (**HTTP 200**) and fans out
offline work to per-provider SQS queues. Local parts live in MSSQL; a
scheduled maintainer refreshes CSV/feeds. Live and sandbox are isolated.
Results land in S3 and are visible on the SQL host via an rclone mapped drive.

## Docs

- [Vision](docs/vision.md) (LOCKED)
- [Endpoint](docs/endpoint-search.md) (`POST /search`)
- [Performance endpoint](docs/endpoint-performance.md) (FR-053a â€” clicks / visits / sales for JWT `userId`)
- [Selftest endpoint](docs/endpoint-selftest.md) (FR-059a â€” provider status + intake on fail)
- [Selftest mocks](docs/mocks/selftest.html) (FR-059n â€” key / [empty](docs/mocks/selftest-empty.html) / [error](docs/mocks/selftest-error.html))
- [Performance mocks](docs/mocks/performance.html) (FR-053g â€” key / [empty](docs/mocks/performance-empty.html) / [error](docs/mocks/performance-error.html))
- [S3 mapping schema](docs/s3-mapping.md) (FR-054a â€” `env` / `userId` / `source` / `token` / `s3Key`)
- [Environments](docs/environments.md)
- [SQS pacing](docs/sqs-pacing.md) (FR-058a â€” prevent provider 407/429)
- [rclone results mount](docs/rclone-results.md) (SQL host `A_SEARCH_RCLONE_ROOT`)
- [madeiradb data model](docs/data-model.md) (FR-113 - dbo inventory + ERD)
- [Identity (8-char user / partner / club codes)](docs/identity.md) (FR-114)
- [Product result schema](docs/result-schema.md) (FR-042)
- [Parts maintainer](docs/parts-maintainer.md)
- [Provider shortlist](docs/provider-shortlist.md)
- [Phase-2 providers](docs/phase2-providers.md) (FR-061 â€” stay-dark until credentials)
- [Add a source](docs/add-source.md) (checklist â€” registry `enabled`, no `entry/` core edits)
- [Skillbook layout](docs/skillbook-layout.md)
- [Shared layer](docs/shared-layer.md) (`shared/` â†’ `/opt/nodejs/a-search`)
- [Tracked links](docs/tracked-links.md) (FR-057 â€” JWT `userId` tenant + provider `.env` account)
- [Intake on exception](docs/intake-on-exception.md) (FR-048 â€” entry/worker/maintainer/onboarding)
- [Onboarding agents](docs/onboarding-agents.md) (FR-049a â€” drain until `remaining=0` + signup fields)
- [Daily report signups](docs/daily-report-signups.md) (FR-052a â€” clubscan field map)
- [Legacy madeira-awin-clubscan](https://github.com/SimonBarnett/AWS/tree/main/Lambdas/madeira-awin-clubscan) (daily onboarding / signup report â€” read-only; HTML email stays in AWS until cutover)
- [Impact pending-onboard queue](docs/impact-pending-onboard-queue.md) (FR-051a â€” API UNKNOWN fallback)
- [Provider onboarding skills](docs/provider-onboarding-skills.md) (FR-060a)
- [Phase 2 stub providers (stay dark)](docs/feature-request-phase2-all-providers-2026-10-08.md) (FR-061..112 / issues #614-#665)
- [Phase 2 FR index](docs/fr/ISSUED-PHASE2.md)
- [Functional spec](docs/functional-spec.md)

## Agent caller skill

`.grok/skills/a-search-endpoint/SKILL.md` â€” how an agent calls the API.

## Shape

**service** â€” Node.js 20+ on AWS. Plan pack validated with
`validate-vision-pack.py`.

## Develop

Requires **Node.js 20+**. From a clean clone:

```bash
npm install
npm test
```

`npm test` runs the Node built-in test runner (`node --test`) over `tests/**/*.test.js`.

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

`npm run synth` must exit 0. Deploy is optional (`npx cdk deploy â€¦`).

## Feature requests

Initial build is split into small, testable GitHub issues labeled
`feature-request`. Prefer one PR per issue.
