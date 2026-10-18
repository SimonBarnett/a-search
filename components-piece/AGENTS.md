# AGENTS --- a-search ComponentsPiece (`components-piece/`)

> **CAST IRON RULE - HARVEST AND FILE EVERYTHING (read this first, every time).**
> 1. ALWAYS harvest skills you learn and file EVERY issue / FR / bug / gap you find in the
>    SAME turn. Never leave a finding unfiled, never "note it for later", never skip it because it is small.
> 2. File with the Bobiverse intake webhook (no secret or login needed;
>    `POST https://irc.ntsa.uk/bob/v1/intake`; offline it is queued locally and retried):
>    `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest -Title "..." -Body "..."`
>    Always pass an explicit `-Repo SimonBarnett/a-search` for this product.
> 3. BEFORE finishing ANY debugging session: promote playbooks via PR to this repo (honesty box)
>    (or intake when push is blocked), then flush any offline intake queue.
> 4. Never put a token, password, JWT secret, MSSQL password, affiliate API key, or private
>    hostname in a filing, a skill, or a log.
> Never park a-search product lessons under bobiverse `harvest/SKILL.md`.

You are in the **components-piece** CWD. This skillbook owns the host-page
widget, Parts/Click APIs, Customers/Widgets DB helpers, S3 customer tree
bootstrap, and offline agent passes that fill `live.json` / `top10.json`.

It does **not** own JWT `POST /search` fan-out (see `entry/`) or provider
workers (see `providers/*/`).

## Read first

1. `.grok/skills/a-search-components-piece/SKILL.md` --- architecture, CWD rules, APIs, agent passes, tests
2. Repo docs: `docs/feature-request-components-piece-2026-10-09.md`, `docs/skillbook-layout.md`, `docs/fr/FR-210.md`
3. Code homes: `../shared/widgets/`, `../shared/components/`, `../shared/dns/`, `../widget/`, `../entry/src/` (parts/go/ext status routes)

## CAST IRON

- Never embed affiliate destination URLs in widget HTML; clicks always go through `GET /go`.
- Never put secrets in `site.md`, `context.md`, skillbooks, mocks, or git.
- Live and sandbox trees must not share prefixes (`{env}/x/{customerNumber}/...`).
- Agents **must not use tokens while idle** (dispatcher job contract #1343).
- Honesty-box harvest home stays **repo-root** `.grok/skills/harvest-agent-skills/` (unchanged). Promote ComponentsPiece playbooks there or into this skillbook; never to bobiverse `harvest/SKILL.md`.

## Agent S3 CWD rules (FR-233 / FR-232)

| Pass | CWD on the customer tree |
|------|--------------------------|
| Host pass (site.md / top10 seed) | `{env}/x/{customerNumber}/` |
| Widget pass (context / searches / ingest / prune) | `{env}/x/{customerNumber}/{widgetGuid}/` |

`site.md` and `context.md` in that tree are the per-host / per-widget context.
This folder's SKILL.md is the **generic** ComponentsPiece skill.

Harvest lessons for widget/API/agent-tree work back into
`.grok/skills/a-search-components-piece/SKILL.md` on this product repo.
