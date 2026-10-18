# AGENTS - a-search magento (local)

> **CAST IRON RULE - HARVEST AND FILE EVERYTHING (read this first, every time).**
> File gaps to SimonBarnett/a-search via intake. Never commit OAuth secrets.

Provider CWD for registry id `magento` (`kind: local`). Merchant source (FR-243).

## Read first

1. `.grok/skills/a-search-magento/SKILL.md`
2. `.grok/skills/a-search-magento-onboarding/SKILL.md`
3. `docs/fr/FR-243.md`

## CAST IRON

- Never enable `oauth/consumer/enable_integration_as_bearer` — always OAuth 1.0a HMAC-SHA256.
- SSRF: store_base_url must be HTTPS public (same gate as FR-238).
- Results key: `{env}/magento/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/oauth1.js` - HMAC-SHA256 signer
- `src/catalog.js` / `src/normalize.js` / `src/upsert.js`
- `src/worker.js` + `src/queryParts.js` + `src/selftestProbe.js`
- Configurable products: **parent row with min price** (default; documented in skill).

CAST IRON: file gaps with Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search (POST https://irc.ntsa.uk/bob/v1/intake).
