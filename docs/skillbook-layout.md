# Per-folder skillbooks (LOCKED)

Every integration folder is a valid **agent CWD**. An agent started in that
directory must have enough skill text to debug and maintain **that**
integration without reading sibling providers.

## Required files per folder

```
providers/live/amazon/
  AGENTS.md                          # CAST IRON + "you are in amazon CWD"
  .grok/skills/a-search-amazon/
    SKILL.md                         # architecture, env, API, failures, tests
  .grok/skills/a-search-amazon-onboarding/
    SKILL.md                         # agent-led account/.env setup (FR-060a)
  .env.example                       # amazon-only secrets placeholders
  src/                               # worker / client code
  package.json                       # optional per-folder deps

providers/local/awin/
  AGENTS.md
  .grok/skills/a-search-awin/
    SKILL.md                         # feed format, MSSQL read path, maintainer hooks
  .grok/skills/a-search-awin-onboarding/
    SKILL.md                         # agent-led onboarding (FR-060a)
  .env.example
  src/

entry/
  AGENTS.md
  .grok/skills/a-search-entry/SKILL.md

maintainer/
  AGENTS.md
  .grok/skills/a-search-maintainer/SKILL.md
```

Live vs local skill focus:

| Kind | Skillbook must cover |
|------|----------------------|
| live | Auth, rate limits, search request/response normalize, SQS payload, S3 write, 401/429 playbook |
| local | How parts land in MSSQL (points at maintainer + this source’s feed parser), search SQL/FTS, RejectedAsins-style filters if any, S3 write |
| entry | JWT, fan-out, registry, never hold provider secrets |
| maintainer | Rolling keys, conditional download, staging MERGE, deletes |

## Agent start rule

- CWD = the integration folder (e.g. `providers/live/amazon`)
- Read that folder’s `AGENTS.md` then its `.grok/skills/*/SKILL.md` first
- Do not require loading every other provider skill to fix amazon
- Harvest lessons back into **that** skillbook (honesty box) on the product repo

## Naming

Skill directory: `a-search-<id>` where `<id>` matches `registry.json` `id`
(`a-search-amazon`, `a-search-awin`, …).

**Onboarding skill (FR-060a):** every provider CWD also ships
`a-search-<id>-onboarding` at
`providers/<kind>/<id>/.grok/skills/a-search-<id>-onboarding/SKILL.md`.
Contract: CAST IRON harvest + intake, steps to obtain `.env` account credentials,
sandbox vs live, selftest pointer. Full contract:
`docs/provider-onboarding-skills.md`. Per-provider bodies are separate FRs.

## Caller skill (agents that invoke the API)

Agents that **call** a-search (they are not sitting in a provider CWD) load:

```
.grok/skills/a-search-endpoint/SKILL.md
```

Repo path after create: `.grok/skills/a-search-endpoint/` (also drafted in this
plan pack under `skills/a-search-endpoint/SKILL.md`). Covers JWT,
`POST /search`, 200 accept, live/sandbox, and rclone/S3 result lookup.
Does not replace per-provider skillbooks.

## CAST IRON harvest checklist (FR-046a)

Every skillbook folder (`AGENTS.md` + `.grok/skills/*/SKILL.md`) must make
agents harvest learnings **back to this product repo**, not to bobiverse
`harvest/SKILL.md`.

Checklist needles (pin these phrases in layout + foundation skill):

| Needle | Why |
|--------|-----|
| CAST IRON | Always harvest / file gaps in the same turn |
| intake | Use the Bobiverse intake webhook when push is blocked |
| `POST https://irc.ntsa.uk/bob/v1/intake` | Token-free intake endpoint |
| `-Repo SimonBarnett/a-search` | Product lessons stay on a-search |
| honesty box | Promote playbooks via PR to **this** repo's skillbook |

Example blurb (paste into new provider `AGENTS.md` / onboarding skills):

```text
CAST IRON harvest: file every issue/FR/gap via
  Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...
or POST https://irc.ntsa.uk/bob/v1/intake with the same -Repo.
Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
Never park a-search product lessons under bobiverse harvest/SKILL.md.
```

Out of scope for FR-046a: rewriting every existing provider file — those
land via per-provider / onboarding FRs. This doc is the layout checklist.
