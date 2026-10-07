# AGENTS — a-search maintainer (`maintainer/`)

You are in the **maintainer** CWD. This folder owns the **scheduled**
local-parts refresh: roll stale feed keys from MSSQL, conditional
download, staging + set-based MERGE/deletes. It does **not** run
`POST /search` or live provider API clients.

## Read first

1. `.grok/skills/a-search-maintainer/SKILL.md` — roll, conditional GET, MERGE
2. Repo docs: `docs/parts-maintainer.md`, `docs/environments.md`, `docs/vision.md`
3. Local provider folders: `../providers/local/<id>/` own feed parsers + secrets

## CAST IRON

- Never put MSSQL passwords, feed API keys, or tokens in committed files.
- Live and sandbox use separate SQL targets and staging paths (`A_SEARCH_ENV`).
- Scope deletes to the current feed key — never global truncate.
- Search workers only **read** Parts; they do not download CSVs.

## Shape

- `src/schedule.js` — EventBridge / scheduled invoke stub (roll/fetch/upsert land in later FRs)
- `.env.example` — MSSQL + `MAINTAINER_TOP` + `A_SEARCH_ENV` placeholders

Harvest maintainer playbooks into
`.grok/skills/a-search-maintainer/SKILL.md` on this product repo.
