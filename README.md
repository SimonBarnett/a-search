# a-search

JWT-authenticated search entry for Club Madeira affiliate / local parts
discovery. One `POST /search` accepts the job (**HTTP 200**) and fans out
offline work to per-provider SQS queues. Local parts live in MSSQL; a
scheduled maintainer refreshes CSV/feeds. Live and sandbox are isolated.
Results land in S3 and are visible on the SQL host via an rclone mapped drive.

## Docs

- [Vision](docs/vision.md) (LOCKED)
- [Endpoint](docs/endpoint-search.md)
- [Environments](docs/environments.md)
- [rclone results mount](docs/rclone-results.md) (SQL host `A_SEARCH_RCLONE_ROOT`)
- [Product result schema](docs/result-schema.md) (FR-042)
- [Parts maintainer](docs/parts-maintainer.md)
- [Provider shortlist](docs/provider-shortlist.md)
- [Add a source](docs/add-source.md) (checklist — registry `enabled`, no `entry/` core edits)
- [Skillbook layout](docs/skillbook-layout.md)
- [Shared layer](docs/shared-layer.md) (`shared/` → `/opt/nodejs/a-search`)
- [Intake on exception](docs/intake-on-exception.md) (FR-048 — entry/worker/maintainer/onboarding)
- [Onboarding agents](docs/onboarding-agents.md) (FR-049a — drain until `remaining=0` + signup fields)
- [Legacy madeira-awin-clubscan](https://github.com/SimonBarnett/AWS/tree/main/Lambdas/madeira-awin-clubscan) (daily onboarding / signup report — read-only; HTML email stays in AWS until cutover)
- [Provider onboarding skills](docs/provider-onboarding-skills.md) (FR-060a)
- [Functional spec](docs/functional-spec.md)

## Agent caller skill

`.grok/skills/a-search-endpoint/SKILL.md` — how an agent calls the API.

## Shape

**service** — Node.js 20+ on AWS. Plan pack validated with
`validate-vision-pack.py`.

## Develop

Requires **Node.js 20+**. From a clean clone:

```bash
npm install
npm test
```

`npm test` runs the Node built-in test runner (`node --test`) over `tests/**/*.test.js`.

## Infrastructure (CDK)

Skeleton under `cdk/` (FR-023): entry Lambda + `a-search-amazon-live` /
`a-search-amazon-sandbox` queues. See [`cdk/README.md`](cdk/README.md).

```bash
npm install
npm run synth
```

`npm run synth` must exit 0. Deploy is optional (`npx cdk deploy …`).

## Feature requests

Initial build is split into small, testable GitHub issues labeled
`feature-request`. Prefer one PR per issue.
