# Initial feature requests

Small, testable FRs for Bob. One PR per issue.

- [FR-001](FR-001.md) — Scaffold root Node 20 package and CI test script
- [FR-002](FR-002.md) — Add providers/registry.json with all shortlist sources and per-env enabled
- [FR-003](FR-003.md) — Scaffold entry/ folder with AGENTS.md and a-search-entry skillbook
- [FR-004](FR-004.md) — Implement JWT Bearer verify extracting userId claim
- [FR-005](FR-005.md) — POST /search accept handler returns 200 with searchId env enqueued
- [FR-006](FR-006.md) — Fan-out enqueue one SQS message per enabled registry source
- [FR-007](FR-007.md) — Live vs sandbox queue name and env stamp isolation
- [FR-008](FR-008.md) — Results path helper for S3 and rclone layout
- [FR-009](FR-009.md) — Worker writes results JSON to S3 at canonical key
- [FR-010](FR-010.md) — Scaffold maintainer/ folder with skillbook and schedule stub
- [FR-011](FR-011.md) — SQL DDL for PartFeedKeys and Parts staging tables
- [FR-012](FR-012.md) — Maintainer roll: select TOP N due PartFeedKeys for env
- [FR-013](FR-013.md) — Conditional feed download skip on 304 or matching ContentHash
- [FR-014](FR-014.md) — Staging bulk load + set-based MERGE upsert for Parts
- [FR-015](FR-015.md) — Scoped delete Parts missing from successful feed refresh
- [FR-016](FR-016.md) — Scaffold providers/live/amazon with skillbook and worker stub
- [FR-017](FR-017.md) — Scaffold providers/live/ebay with skillbook and worker stub
- [FR-018](FR-018.md) — Scaffold providers/live/rakuten with skillbook and worker stub
- [FR-019](FR-019.md) — Scaffold providers/live/cj with skillbook and worker stub
- [FR-020](FR-020.md) — Scaffold providers/local/awin with skillbook and MSSQL search stub
- [FR-021](FR-021.md) — Scaffold providers/local/impact with skillbook and MSSQL search stub
- [FR-022](FR-022.md) — Scaffold remaining shortlist providers as disabled stubs
- [FR-023](FR-023.md) — SAM or CDK skeleton for entry Lambda and per-source queues
- [FR-024](FR-024.md) — EventBridge rule wiring for maintainer schedule
- [FR-025](FR-025.md) — docs/add-source.md checklist for new provider
- [FR-026](FR-026.md) — Fan-out integration test with mock registry and mock SQS
- [FR-027](FR-027.md) — Auth env-isolation and skillbook layout smoke tests
- [FR-028](FR-028.md) — Wire harvest-agent-skills honesty box into a-search
- [FR-029](FR-029.md) — Document rclone mount env vars for SQL host results root
- [FR-030](FR-030.md) — Implement amazon live search client with recorded HTTP fixtures
