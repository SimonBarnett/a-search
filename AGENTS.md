# AGENTS — a-search (SimonBarnett/a-search)

> **CAST IRON RULE - HARVEST AND FILE EVERYTHING (read this first, every time).**
> 1. ALWAYS harvest skills you learn and file EVERY issue / FR / bug / gap you find in the
>    SAME turn. Never leave a finding unfiled, never "note it for later", never skip it because it is small.
> 2. File with the Bobiverse intake webhook (no secret or login needed;
>    `POST https://irc.ntsa.uk/bob/v1/intake`; offline it is queued locally and retried):
>    `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest -Title "..." -Body "..."`
>    Always pass an explicit `-Repo SimonBarnett/a-search` for this product.
> 3. BEFORE finishing ANY debugging session: promote playbooks via PR to this repo (or intake
>    when push is blocked), then flush any offline intake queue.
> 4. Never put a token, password, JWT secret, MSSQL password, affiliate API key, or private
>    hostname in a filing, a skill, or a log.

You are in the **a-search** product root. Per-folder CWDs live under `entry/`,
`providers/live/<id>/`, `providers/local/<id>/`, and `maintainer/` — each has its own
`AGENTS.md` + `.grok/skills/a-search-<id>/SKILL.md`.

## Read first

1. `.grok/skills/harvest-agent-skills/SKILL.md` — honesty box (home: this repo)
2. `docs/vision.md`, `docs/add-source.md`, `docs/skillbook-layout.md`
3. Folder AGENTS for the CWD you will edit

## Foundation

`Foundation: harvest-agent-skills (honesty box) -> report back to https://github.com/SimonBarnett/a-search.`

Product playbooks (providers, Parts, CDK, entry JWT/fan-out) harvest **here**.
Bobiverse fleet/chair/worker lessons go to `SimonBarnett/bobiverse` — do not park
a-search product tips under bobiverse `harvest/SKILL.md`.

## Tests and secrets (bobiverse#3304 / a-search#611)

Never write realistic secret literals in tests (contiguous JWT headers, `Bearer eyJ…`,
`password=hunter2`, live-shaped API keys). Build fixtures at runtime from parts via
`tests/fixtures/fakeSecrets.js`, or use obvious placeholders (`FAKE_`, `EXAMPLE`,
`xxxx`, AWS `AKIA…EXAMPLE`). Assert with `reLiteral` / `reFromParts` from that helper
so regexes also stay free of contiguous secret-shaped strings.
