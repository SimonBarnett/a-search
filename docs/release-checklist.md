# Release checklist - first installable tag (`v0.1.0`)

**FR-145.** Ops / MRB / UAT use this before cutting the GitHub Release for the
**v0.1 AWS installable** wave. Canonical DoD: [release-installable.md](release-installable.md)
(FR-128). Cutting the GitHub Release itself stays with the Plan / UAT seat
(out of scope for the FR-145 implementer).

Target tag: **`v0.1.0`** (must match the root `VERSION` file).

## Pre-tag gates

- [ ] `VERSION` file is a single semver line (no `v` prefix) matching the intended tag without `v`
- [ ] `package.json` `"version"` matches `VERSION`
- [ ] `npm test` green on Node >=20 (fleet: `D:\tools\node` or CI Node 20)
- [ ] `npm run synth` green (or in-process synth pins used by CI)
- [ ] GitHub Actions on `main` green for the tip being tagged (FR-139)
- [ ] Deploy playbook followed on the target account/region: [deploy.md](deploy.md) (FR-140 / FR-141)
- [ ] Post-deploy smoke pass: `npm run smoke-deploy` with fixture JWT (FR-144) - or documented manual equivalent if smoke PR not yet merged
- [ ] Secrets stay out of git (synth secret-scan / secrets-matrix)
- [ ] Stay-dark Phase-2 providers remain `enabled=false` (FR-061 / FR-126)

## Tag steps (Plan / UAT seat)

1. Confirm every box above.
2. Tag annotated: `git tag -a v0.1.0 -m "a-search v0.1.0 installable"`
3. Push tag; create GitHub Release notes pointing at this checklist + DoD.
4. Do **not** stamp human UAT from this checklist alone.

## Related

- DoD metrics D1-D7: [release-installable.md](release-installable.md)
- Gap table: [release-gap-aws-installable-2026-10-09.md](release-gap-aws-installable-2026-10-09.md)
- Deploy: [deploy.md](deploy.md)
- Smoke: `scripts/smoke-deploy.js` (FR-144)
