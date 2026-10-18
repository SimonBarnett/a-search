# FR-3944 walrus / no-MSSQL cutover — child FR matrix

Living umbrella: [#3944](https://github.com/SimonBarnett/a-search/issues/3944).
Plan issue closed by this tip: [#3946](https://github.com/SimonBarnett/a-search/issues/3946).

## Simon scope (2026-10-18)

- Live-search **providers** (eBay, Amazon, …) stay in AWS with **no** MSSQL access.
- Merchants and affiliates whose data is in the DB share **one** SQS queue, drained on walrus.
- Results land at -clubs/{host}/{guid}/IN/ (no HOSTS/ prefix).
- Onboarding writes S3 metadata and name/value pairs (not MSSQL rows).
- Maintainer / Parts work runs on the DB side.
- FR-122 option **C** locked; no inbound ports to walrus.

## Child FRs

| # | Title | Role |
|---|-------|------|
| [#3948](https://github.com/SimonBarnett/a-search/issues/3948) | Docs lock FR-122 C, walrus host, a-clubs IN path | Docs |
| [#3949](https://github.com/SimonBarnett/a-search/issues/3949) | CDK strip MSSQL Lambdas, one DB-backed SQS + walrus IAM | CDK |
| [#3950](https://github.com/SimonBarnett/a-search/issues/3950) | Entry enqueue DB-backed work to the single SQS queue | Entry |
| [#3951](https://github.com/SimonBarnett/a-search/issues/3951) | Walrus drain runner writes a-clubs/{host}/{guid}/IN | Walrus |

Implement seats take the children; keep #3944 open as the umbrella until acceptance is covered (Refs only on partial work).
