# Feature request: Phase 4 — stay-dark enablement, Creators, WAF, multi-region

**Repo:** SimonBarnett/a-search
**Date:** 2026-10-09
**Depends:** v0.1 installable wave (FR-128..165) preferred first; FR-126 enable template (#955)

## Waves

| Wave | FR codes | Issues |
|------|----------|--------|
| Enablement index | FR-166 | #1011 |
| Per-provider enable (14) | FR-167..180 | #1013-#1027 (see ISSUED-PHASE4.tsv) |
| Amazon Creators API | FR-181..185 | #1028-#1032 |
| WAF | FR-186..189 | #1033-#1036 |
| Multi-region | FR-190..194 | #1037-#1041 |

## Success (wave)

| id | metric | target | how measured | fail-when |
|----|--------|--------|--------------|-----------|
| E1 | One-id enable | Each stay-dark id has its own enable FR; no bulk flip | ISSUED-PHASE4 + registry pins | One PR enables many ids |
| E2 | Creators opt-in | Creators behind flag; PA-API default until lock says otherwise | FR-181..185 pins | Silent replace of PA-API |
| E3 | WAF on API | WebACL associated to HTTP API | synth + docs/waf.md | API public with no WAF after wave done |
| E4 | Multi-region documented | Strategy LOCKED; second stack deployable | docs + FR-191 synth | Undocumented dual-region tribal knowledge |

## Out of scope

- Replicating IONOS MSSQL
- Enabling providers without credentials