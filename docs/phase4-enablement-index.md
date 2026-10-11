# Phase-4 stay-dark enablement index (FR-166)

Index + **credential-gate checklist** for enabling Phase-2 stay-dark providers
one id at a time. This document does **not** flip any `enabled` flag.

Parent wave: [feature-request-phase4-enable-creators-waf-multiregion-2026-10-09.md](feature-request-phase4-enable-creators-waf-multiregion-2026-10-09.md).
Issue table: [fr/ISSUED-PHASE4.md](fr/ISSUED-PHASE4.md) / `fr/ISSUED-PHASE4.tsv`.

CAST IRON:

- Never auto-enable on deploy
- Never bulk-flip every stay-dark id in one PR
- Never commit secrets / JWTs / API tokens
- Per-id enable only via FR-167..180 (this index is FR-166 only)

## Prerequisites (every enable FR)

Follow the ritual template: [phase3-enable-provider.md](phase3-enable-provider.md) (**FR-126**).

Before flipping **one** id:

1. Credentials exist in Secrets Manager / deploy context (FR-138 pattern) - not git
2. Provider unit pins green without live network
3. Selftest green for that id on the target env (`endpoint-selftest.md`)
4. Flip **only** that id in `providers/registry.json`
5. Pin asserts other stay-dark ids remain `enabled.*.false` (unless already enabled by their own merged FR)
6. Local/`kind: local` ids: DDL + Parts + least-privilege SQL path first (FR-126 local gates)

## Credential-gate checklist (ops)

Use before opening or merging any FR-167..180 tip. Tick per id / env:

| # | Gate | Evidence |
|---|------|----------|
| 1 | Secret ARN context wired for this source (`*ProviderSecretArn` / FR-138 keys) | Deploy context / Secrets Manager console (no values in git) |
| 2 | Skillbook obtain steps followed (`providers/.../.grok/skills/a-search-<id>/`) | Operator note |
| 3 | `.env.example` placeholders only in repo | `git grep` / review |
| 4 | Unit / client pins pass (`node --test` for that provider) | CI or local |
| 5 | Selftest returns ok (or classified non-credential miss) for this id | `GET /selftest` / FR-144 smoke |
| 6 | No other stay-dark id flipped in the same PR | Diff of `providers/registry.json` |
| 7 | Local ids: maintainer DDL + Parts rows + SQL network path | FR-126 local section |
| 8 | After flip: synth includes `a-search-{id}-{live,sandbox}` queues/workers | `npm run synth` / enable FR pin |

Fail-when: credentials missing, selftest red, bulk enable, secrets in git.

## Stay-dark enable FRs (one id each)

Already enabled (Phase-1; do not flip false here): `amazon`, `ebay`, `rakuten`,
`cj`, `awin`, `impact`.

| id | kind | Enable FR | Issue |
|----|------|-----------|------:|
| `kelkoo` | live | FR-167 | [#1013](https://github.com/SimonBarnett/a-search/issues/1013) |
| `skimlinks` | live | FR-168 | [#1015](https://github.com/SimonBarnett/a-search/issues/1015) |
| `aliexpress` | live | FR-169 | [#1016](https://github.com/SimonBarnett/a-search/issues/1016) |
| `etsy` | live | FR-170 | [#1017](https://github.com/SimonBarnett/a-search/issues/1017) |
| `bol` | live | FR-171 | [#1018](https://github.com/SimonBarnett/a-search/issues/1018) |
| `partnerize` | local | FR-172 | [#1019](https://github.com/SimonBarnett/a-search/issues/1019) |
| `webgains` | local | FR-173 | [#1020](https://github.com/SimonBarnett/a-search/issues/1020) |
| `tradedoubler` | local | FR-174 | [#1021](https://github.com/SimonBarnett/a-search/issues/1021) |
| `admitad` | local | FR-175 | [#1022](https://github.com/SimonBarnett/a-search/issues/1022) |
| `flexoffers` | local | FR-176 | [#1023](https://github.com/SimonBarnett/a-search/issues/1023) |
| `avantlink` | local | FR-177 | [#1024](https://github.com/SimonBarnett/a-search/issues/1024) |
| `shopify` | local | FR-178 | [#1025](https://github.com/SimonBarnett/a-search/issues/1025) |
| `wix` | local | FR-179 | [#1026](https://github.com/SimonBarnett/a-search/issues/1026) |
| `woocommerce` | local | FR-180 | [#1027](https://github.com/SimonBarnett/a-search/issues/1027) |

## Other Phase-4 waves (index only)

| Wave | FR codes | Issues | Notes |
|------|----------|--------|-------|
| Amazon Creators API | FR-181..185 | #1028-#1032 | Opt-in; PA-API default until locked otherwise |
| WAF | FR-186..189 | #1033-#1036 | WAFv2 on HTTP API |
| Multi-region | FR-190..194 | #1037-#1041 | Strategy + second stack |

Those waves are **not** provider enable flips. See ISSUED-PHASE4 for titles.

## Related

- Stay-dark rule: [phase2-providers.md](phase2-providers.md) (FR-061)
- Enable ritual: [phase3-enable-provider.md](phase3-enable-provider.md) (FR-126)
- Secrets matrix: [secrets-matrix.md](secrets-matrix.md) (FR-150)
- Deploy: [deploy.md](deploy.md)
- Pin: `tests/fr166-phase4-enablement-index.test.js`
