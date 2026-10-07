# AGENTS — a-search entry (`entry/`)

You are in the **entry** CWD. This folder owns the JWT-authenticated
`POST /search` accept path and fan-out enqueue. It does **not** hold
provider API secrets or run provider workers.

## Read first

1. `.grok/skills/a-search-entry/SKILL.md` — architecture, env, JWT, fan-out
2. Repo docs: `docs/endpoint-search.md`, `docs/environments.md`, `docs/vision.md`
3. Registry: `../providers/registry.json` + `../providers/loadRegistry.js`

## CAST IRON

- Never put JWTs, passwords, JWKS secrets, or connection strings in
  committed files, harvest filings, or chat paste beyond what the human shared.
- Never store provider credentials (`AMAZON_*`, `EBAY_*`, Awin keys, …) here.
  Those live in each provider folder’s `.env`.
- `userId` comes from the JWT claim only — never trust a body `userId`.
- Live and sandbox must not share queues, SQL, or result prefixes.

## Shape

- `src/index.js` — HTTP handler stub (JWT verify + fan-out land in later FRs)
- `.env.example` — `JWT_*` and `A_SEARCH_ENV` placeholders only

Harvest lessons for the entry path back into
`.grok/skills/a-search-entry/SKILL.md` on this product repo.
