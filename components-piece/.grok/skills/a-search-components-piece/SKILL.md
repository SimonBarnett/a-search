---
name: a-search-components-piece
description: >
  Maintain a-search ComponentsPiece: host widget, GET /parts and GET /go,
  Customers/Widgets DB, S3 customer tree, offline agent site/context/ingest/prune
  passes. Use in components-piece/ CWD, for widgetGuid / widget.json /
  feedback.json / tier-cap / dispatcher work, or /a-search-components-piece.
  Honesty box remains repo-root harvest-agent-skills.
---

# a-search ComponentsPiece (widget + Parts/Click + agent tree)

> **CAST IRON:** Never commit JWTs, affiliate API keys, MSSQL passwords, or
> embed affiliate destination URLs in widget markup. Clicks always go through
> `GET /go`.

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Product honesty-box home: `.grok/skills/harvest-agent-skills/SKILL.md` (repo root).

You are working in **`components-piece/`** --- the agent CWD for the host-page
widget stack (Phase 5). Processing for Parts/Click is synchronous HTTP;
agent tree fills are offline (dispatcher #1343).

Canonical docs: `docs/feature-request-components-piece-2026-10-09.md`,
`docs/skillbook-layout.md`, `docs/fr/FR-196.md` .. `docs/fr/FR-210.md`.

## When to load this skill (triggers)

| Trigger | Work |
|---------|------|
| parts / `GET /parts` | Page `live.json` by `widgetGuid` |
| go / `GET /go` | Resolve click URL; never embed affiliate in widget |
| widget / `widget/` JS+CSS | Embed script; layout-only CSS; `data-widget-guid` |
| agent / site.md / context.md | Offline host or widget passes |
| `widgetGuid` / `widget.json` | Bind identity; bootstrap paths |
| `feedback.json` | Fold context/removal into context.md / exclude[] |
| tier cap / free / fullTier | Query and live caps (FR-205 / FR-206 / FR-207 / #1345) |
| dispatcher / host_created / widget_created / in_ready | Job contract (#1343); **no tokens while idle** |

## Responsibilities

| Owns | Does not own |
|------|----------------|
| Widget JS/CSS under `widget/` | JWT `POST /search` fan-out (`entry/`) |
| `shared/widgets/*` (parts, go, bootstrap, agent passes, widgetPath) | Provider workers / `.env` secrets |
| `shared/components/customers.js` (Customers + Widgets) | MSSQL parts maintainer |
| `shared/dns/hostTxtStatus.js` + `/ext/status` | Ergo / bobiverse fleet |
| CDK routes for `/parts`, `/go`, `/ext/status` (with entry Lambda) | Writing provider search results to userId S3 |

## Identity and paths (LOCKED)

- Widget identity is **`widgetGuid`** (FR-232), not host+uri alone.
- Path helper: `shared/widgets/widgetPath.js`.
- Host tree: `{env}/x/{customerNumber}/` --- `_host.json`, `site.md`, host `top10.json`.
- Widget tree: `{env}/x/{customerNumber}/{widgetGuid}/` --- `widget.json`, `live.json`, `searches.json`, `context.md`, `in.json`, `feedback.json`.

### Agent CWD rules (FR-233)

| Pass | CWD |
|------|-----|
| Host pass | `{env}/x/{customerNumber}/` |
| Widget pass | `{env}/x/{customerNumber}/{widgetGuid}/` |

This skillbook is generic. Per-host / per-widget context lives in `site.md` /
`context.md` on the tree.

## HTTP APIs (public host-keyed; not JWT search)

- `GET /parts?host&widgetGuid&offset&n` --- page that widget's `live.json`.
- `GET /go?host&widgetGuid&part&cid` --- affiliate or signup URL; stamp clickId.
- `GET /ext/status?host` --- Club TXT enables extension; Partner optional.

Dual DNS TXT (FR-200): Club required to approve; Partner alone never unlocks.

## Offline agent passes (shared/widgets)

| Module | Role |
|--------|------|
| `agentSitePass.js` | Missing `site.md` --- write affiliate skillbook; seed host `top10.json` |
| `agentWidgetContext.js` | Fold `feedback.json`; maintain `context.md` + capped `searches.json` |
| `agentIngest.js` | Safe rename `in.json` -> `in.processing.json` -> merge `live.json` -> delete |
| `agentPruneTop10.js` | Prune expired/broken/exclude; re-cap live; roll host `top10.json` (cap 10) |

**Idle rule:** agents must not burn tokens while waiting for dispatcher events.

## Caps (pin with tests)

| Surface | Free | Full tier (upgraded + fullscreen) |
|---------|------|-------------------------------------|
| searches.json queries | 3 | 15 |
| live.json parts | 10 | 500 |
| host top10.json | 10 | 10 |

## Tests (pin before claiming green)

```
node --test tests/components-piece-*.test.js tests/fr200-dns-txt-gate.test.js
```

Skillbook layout pin: `tests/skillbook-layout.test.js` (this folder + skill id).

## Failures (playbook)

| Symptom | Check |
|---------|--------|
| Widget shows no parts | `live.json` empty; bootstrap ran; host/GUID mismatch |
| Click returns signup only | Club TXT missing; Customers.approved false; cache TTL |
| Affiliate URL in page source | Widget must use `button[data-action=go]` + `/go` (FR-203) |
| Agent left `in.json` | Ingest rename/delete path; dispatcher `in_ready` |
| Tokens while idle | Dispatcher contract --- exit when no event |

## Shape of this folder

```
components-piece/
  AGENTS.md
  .grok/skills/a-search-components-piece/SKILL.md
```

Code stays under `shared/`, `widget/`, `entry/`, `cdk/`, `db/migrations/`.
This CWD is the skillbook home so an agent can maintain the stack in isolation.
