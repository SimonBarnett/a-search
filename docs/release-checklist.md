# Release checklist - first installable tag (`v0.1.0`)

**FR-145 / FR #5325.** Ops / MRB / UAT use this before cutting the GitHub Release for the
**v0.1 AWS installable** wave. Canonical DoD: [release-installable.md](release-installable.md)
(FR-128). Cutting the GitHub Release itself stays with the Plan / UAT seat
(out of scope for the FR-145 / #5325 implementer).

Target tag: **`v0.1.0`** (must match the root `VERSION` file).

**Tag status (FR #5325):** no git tag and no GitHub Release yet. This docs change does **not** create either.

## Pre-tag gates

- [x] `VERSION` file is a single semver line (no `v` prefix) matching the intended tag without `v` - **true on main:** `0.1.0`
- [x] `package.json` `"version"` matches `VERSION` - **true on main:** `0.1.0`
- [x] CI workflow on `main` runs `npm test` / `npm run synth` (`.github/workflows/ci.yml` job `test-and-synth`, FR-139) - tip green still required before cutting the tag
- [ ] `npm test` green on Node >=20 for the tip being tagged (fleet: `D:\tools\node` or CI Node 20)
- [ ] `npm run synth` green for the tip being tagged (or in-process synth pins used by CI)
- [ ] GitHub Actions on `main` green for the tip being tagged (FR-139)
- [ ] Deploy playbook followed on the target account/region: [deploy.md](deploy.md) (FR-140 / FR-141)
- [ ] Post-deploy smoke pass: included in `npm run deploy` (FR #4881 runs `smoke-deploy` with IAM SigV4 against SearchApiUrl after cdk). Manual re-smoke: `npm run smoke-deploy` (FR-144 / FR #4888). No hand-set JWT / `A_SEARCH_API_URL` required for the deploy path.
- [ ] UAT S19 live `/selftest`: `npm run smoke-selftest` (GET then POST) with IAM SigV4 (FR #4882 / FR #4888). Never print credentials.
- [ ] Secrets stay out of git (synth secret-scan / secrets-matrix)
- [ ] Hold-dark ids stay `enabled=false` on purpose: bol, aliexpress, avantlink, flexoffers, admitad (FR #5323 / FR-061). Later merchant connects (squarespace, magento, ecwid, bigcommerce) also stay false - that is not a failure of the enabled set. Do not require every Phase-2 id to remain dark.

## Tag steps (Plan / UAT seat)

1. Confirm every box above.
2. Tag annotated: `git tag -a v0.1.0 -m "a-search v0.1.0 installable"`
3. Push tag; create GitHub Release notes pointing at this checklist + DoD.
4. Do **not** stamp human UAT from this checklist alone.
5. Do **not** cut the tag from FR #5325 (docs evidence only).

## Related

- DoD metrics D1-D7: [release-installable.md](release-installable.md)
- Gap table: [release-gap-aws-installable-2026-10-09.md](release-gap-aws-installable-2026-10-09.md)
- Deploy: [deploy.md](deploy.md)
- Smoke: `scripts/smoke-deploy.js` (FR-144); wired into `npm run deploy` via `scripts/cdk-deploy-with-smoke.js` (FR #4881)
