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
- [Parts maintainer](docs/parts-maintainer.md)
- [Provider shortlist](docs/provider-shortlist.md)
- [Skillbook layout](docs/skillbook-layout.md)
- [Functional spec](docs/functional-spec.md)

## Agent caller skill

`.grok/skills/a-search-endpoint/SKILL.md` — how an agent calls the API.

## Shape

**service** — Node.js 20+ on AWS. Plan pack validated with
`validate-vision-pack.py`.

## Feature requests

Initial build is split into small, testable GitHub issues labeled
`feature-request`. Prefer one PR per issue.
