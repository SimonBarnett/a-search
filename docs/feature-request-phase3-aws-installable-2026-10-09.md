# Feature request: a-search Phase 3 — AWS installable release

**Repo:** SimonBarnett/a-search  
**Date:** 2026-10-09  
**Baseline:** origin/main @ 0342707  
**Companion:** `RELEASE-GAP-AWS-INSTALLABLE.md` (plan folder / docs park)  
**DoD (FR-128):** [`docs/release-installable.md`](release-installable.md)

## Ultimate objective

Operators can `cdk deploy` a-search to AWS so the **enabled** providers (amazon, ebay, rakuten, cj, awin, impact) accept JWT search, fan-out, write S3 results, reach MSSQL for local parts, and pass a smoke script — without committing secrets.

## Shape

**service** (unchanged).

## Success (wave)

| id | metric | target | how measured | fail-when |
|----|--------|--------|--------------|-----------|
| R1 | CI gate | `npm test` + `npm run synth` on Node 20 in GitHub Actions | workflow on PR | No CI or synth skipped |
| R2 | Results store | Bucket exists; Lambdas have `S3_RESULTS_BUCKET` + IAM | synth + pin | Workers throw missing bucket |
| R3 | Asset integrity | maintainer/onboarding/worker zips include `shared/` + required SDK/mssql | stage pin tests | Relative require fails in Lambda |
| R4 | Secrets | JWT/MSSQL/provider secrets via Secrets Manager refs | synth secret-scan clean | Passwords in git or plaintext env in template |
| R5 | Deployable | `docs/deploy.md` + `npm run deploy` context knobs | pin + dry run docs | README-only tribal knowledge |
| R6 | Smoke | Script asserts `/search` 200 accept + `/selftest` shape | unit test + manual after deploy | No post-deploy verification |
| R7 | Release tag path | VERSION + checklist | pin | No installable tag criteria |
| R8 | Stay-dark | Phase-2 ids remain enabled=false | registry pin | Accidental enable without FR-126 ritual |

## Small FRs

FR-128…FR-150 (see `docs/fr/`). Prior unlock FR-121…127 remain in flight (#950–#956).

## Out of scope

- Enabling stay-dark providers  
- Amazon Creators API  
- Plan-seat `cdk deploy` to production  
- Stamping UAT  
