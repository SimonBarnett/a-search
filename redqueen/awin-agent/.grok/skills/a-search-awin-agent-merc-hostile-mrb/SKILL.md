---
name: a-search-awin-agent-merc-hostile-mrb
description: >
  FR #4126 Merc playbook for redqueen/awin-agent. Hostile post-build MRB for Awin / a-search work: after a build agent says
  "UAT-ready", pull main, run tests, typecheck and CLI dry-runs yourself, check
  no hard-coded publisher id in src, dry-run defaults intact, no invented join
  API, no secrets; give PASS / PASS-with-nits / FAIL, write
  docs/mrb-merc-YYYY-MM-DD-vN.md, and message the builder with ordered fixes.
  Compare to docs/vision.md — drift = FAIL.
---

# Merc hostile MRB

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never put a password, OTP, IMAP app password, API token, feed URL (it carries an apikey), or publisher id in a filing, skill, or log.

## When to use

- A builder (Bob seat / worker) reports an Awin-touching FR or repo as
  "UAT-ready" / "ready for Merc".
- Never review your own build.

## Inputs

| Input | Source |
|---|---|
| Repo + branch / PR | builder's message |
| Vision | `docs/vision.md` (LOCKED) and the FR issue's Goal / Testable |
| Prior MRBs | `docs/mrb-*.md` |

## Steps

1. Fresh clone or `git fetch && git checkout main && git pull`; record `git rev-parse HEAD`.
2. Install and run **everything yourself** — do not trust the builder's log:
   `npm ci` (or `npm install`), `npm test`, typecheck (`npm run typecheck` /
   `tsc --noEmit` if present), `npm run validate:vision` where defined.
3. CLI / handler dry-run with a **foreign** publisher id (e.g. `9999999`) and no
   token: output must carry the injected id; missing id must fail non-zero.
4. Hostile greps on runtime code (`src/`, `providers/**/src`, `shared/`, `entry/src`):
   - real publisher id literal → FAIL
   - `apikey=`, `productdata.awin.com/datafeed/…/apikey/`, `Bearer ey`, passwords → FAIL
   - any join write endpoint (`POST …/join`, `/apply`) against Awin → FAIL (none exists)
   - writes to madeiradb or the old partner portal → FAIL
   - S3 folder writes that delete/re-put instead of head-object + merge + copy-object
     `REPLACE`, reset `lastdownload`/`laststatus`/`lastsize`, skip `AES256`, or store a
     real key in `feedurl` instead of `{feedapikey}` → FAIL
5. Defaults: `AWIN_JOIN_DRY_RUN` defaults true; workers that cannot act return
   a stub status (`needs_auth`) rather than clicking anything.
6. Vision check: compare the change to `docs/vision.md` Success rows / LOCKED
   list and to the FR's Testable lines. Any drift (new surface not in vision,
   isolation broken, skill outside its CWD) = **FAIL**.
7. Verdict:
   - **PASS** — all bars hold.
   - **PASS-with-nits** — bars hold; docs/naming nits only.
   - **FAIL** — any bar broken, tests red, secret found, or vision drift.
8. Write `docs/mrb-merc-YYYY-MM-DD-vN.md`: repo, reviewed SHA, verdict,
   pass-bar table, ordered fixes (blockers first), what was NOT run (live API,
   live join), sign-off line with Europe/London date.
9. Message the builder: verdict + numbered fixes in order. FAIL → "rework and
   re-request MRB"; never fix their code yourself in the same pass.

## Success criteria

- MRB doc committed via PR (or intake when push is blocked) with a SHA and verdict.
- Builder has an ordered fix list.

## Failure modes / stop rules

| Symptom | Action |
|---|---|
| Tests need live credentials | Mark "not run", do not supply secrets; that bar is unproven, not passed |
| Builder's PR already merged | Review main at the merge SHA; still write the doc |
| Branch behind main | Merge/rebase locally to test; note it |

## Security

- Run with no real tokens unless the human provides a sandbox one.
- Redact any secret you find in the MRB doc (`[REDACTED]`) and file an
  intake issue to rotate it.
