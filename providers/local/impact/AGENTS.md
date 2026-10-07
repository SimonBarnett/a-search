# AGENTS — a-search Impact local (`providers/local/impact`)

You are in the **Impact local parts** provider CWD. This folder owns the
SQS worker that **SELECTs** from MSSQL `Parts` (maintainer-owned data)
and writes results JSON to S3. It does **not** download Impact CSV feeds
(that is `maintainer/`).

## Read first

1. `.grok/skills/a-search-impact/SKILL.md`
2. Repo docs: `docs/parts-maintainer.md`, `docs/endpoint-search.md`
3. Registry: `../../registry.json` id `impact` (`kind: local`)

## CAST IRON

- Never commit MSSQL passwords or Impact feed credentials here.
- Refuse jobs when `message.env` !== `A_SEARCH_ENV`.
- Results key: `{env}/impact/{userId}/{catalogId}/{searchId}.json`.
- Search workers only **read** Parts; never MERGE/delete.

## Shape

- `src/worker.js` — `run(msg, deps?)` MSSQL SELECT → normalize → writeResults (FR-044)
- `src/queryParts.js` — injectable `defaultQueryParts` / `ImpactMssqlConfigError`
- `.env.example` — SQL + queue/S3 placeholders
