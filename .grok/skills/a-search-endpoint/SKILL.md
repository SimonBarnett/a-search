---
name: a-search-endpoint
description: >
  Call the a-search HTTP API as an agent: obtain login JWT, POST /search,
  GET/POST /account/performance (clicks visits sales for JWT userId),
  GET/POST /selftest (provider status + intake on fail),
  interpret 200 accept vs 401/400, live vs sandbox, and find offline results
  on the SQL host rclone path (or S3 key). Use when searching affiliate/local
  parts via a-search, Club Madeira catalogue enrich, or /a-search.
---

# a-search endpoint (agent caller)

> **CAST IRON:** Never put JWTs, passwords, or connection strings in harvest
> filings, skill edits, logs you commit, or chat paste beyond what the human
> already shared. Prefer env vars / secret stores.

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

You are a **caller** of `a-search`, not a provider worker. Search is
**accept-and-continue**: HTTP returns when the job is queued; products appear
later under the results path.

Canonical product docs: `docs/endpoint-search.md`,
`docs/endpoint-performance.md` (FR-053a — clicks / visits / sales),
`docs/endpoint-selftest.md` (FR-059a — provider status + intake on fail),
`docs/environments.md`, `docs/rclone-results.md` (SQL host mount env vars +
path), `docs/skillbook-layout.md` (FR-046a harvest checklist). This skill is
the agent playbook.

## When to use

- Need multi-source product hits (Amazon, eBay, Awin local parts, …)
- Need **account performance** (clicks, visits, sales) for the JWT `userId`
- Need a **provider selftest** (which sources are ok; failures file intake)
- Must pass a **login JWT** whose `userId` claim owns the result files
- Live vs sandbox must not be mixed

## Preconditions

1. Login service has issued a JWT with claim **`userId`** (string).
2. Base URL for the env (examples — replace with deploy values):
   - live: `A_SEARCH_URL_LIVE`
   - sandbox: `A_SEARCH_URL_SANDBOX`
3. You know `catalogId`, `category`, `subcategory`, and search text.

## Call syntax

```
POST {A_SEARCH_URL}/search
Authorization: Bearer {JWT}
Content-Type: application/json
```

### Body

```json
{
  "q": "noise cancelling headphones",
  "searchterms": ["noise cancelling", "wireless"],
  "catalogId": 123,
  "category": "Electronics",
  "subcategory": "Headphones",
  "sources": ["amazon", "ebay", "awin"],
  "sandbox": false
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `q` or `searchterms` | yes | At least one |
| `catalogId` | yes | Catalogue context |
| `category` | yes | |
| `subcategory` | yes | |
| `sources` | no | Subset of **already enabled** registry ids; omit = all enabled for env |
| `sandbox` | no | `true` = sandbox env; omit/`false` = live |

**Do not** send `userId` in the body. It comes from the JWT.

### Success — HTTP 200

```json
{
  "searchId": "srch_01JEXAMPLE",
  "accepted": true,
  "userId": "ABC12345",
  "env": "live",
  "enqueued": ["amazon", "ebay", "awin"]
}
```

Meaning: job accepted; workers run **offline**. This response is **not** the
product list. Save `searchId`, `userId`, and `env` for result lookup.

### Errors

| Status | Meaning | Agent action |
|--------|---------|--------------|
| 401 | Missing/invalid JWT or missing `userId` claim | Re-login; do not retry with same dead token |
| 400 | Validation (`fields` lists missing keys) | Fix body; retry once |
| 5xx | Gateway/entry fault | Back off; report with `searchId` if any |

No enqueue on 4xx/401.

## Account performance (FR-053a)

Canonical contract: **`docs/endpoint-performance.md`**.

```
GET {A_SEARCH_URL}/account/performance?from=YYYY-MM-DD&to=YYYY-MM-DD&sandbox=false
Authorization: Bearer {JWT}
```

Or `POST /account/performance` with JSON `{ "from", "to", "sandbox" }`.

| Rule | Detail |
|------|--------|
| Auth | Same Bearer JWT; **`userId` from JWT only** |
| Body/query `userId` | Not authority — omit it |
| 200 fields | `clicks`, `visits` / `uniqueVisitors`, `sales` (count/amount/commission), `env`, echoed `userId` |
| Empty account | **200** with zeros / empty arrays (not 404) |
| Env | `sandbox: true` → sandbox; omit/false → live |

Implementation / aggregates are later FR-053 slices; until then treat the
route as stubbed per those docs.

## Provider selftest (FR-059a)

Canonical contract: **`docs/endpoint-selftest.md`**.

```
GET {A_SEARCH_URL}/selftest?sandbox=false
Authorization: Bearer {JWT}
```

Or `POST /selftest` with JSON `{ "sandbox", "sources?" }`.

| Rule | Detail |
|------|--------|
| Auth | Same Bearer JWT; **`userId` from JWT only** |
| Env | `sandbox: true` → sandbox; omit/false → live |
| 200 body | `providers[]` with `id` + `ok` (+ optional `error`); `failed`; `intakeFiled` |
| Intake on fail | Each failed provider probe files intake with **`repo=SimonBarnett/a-search`** (redacted, deduped) |
| 401/400 | No intake |

Implementation is a later FR-059 slice; until then treat the route as
documented-only.

## Example (PowerShell)

```powershell
$headers = @{
  Authorization = "Bearer $env:A_SEARCH_JWT"
  'Content-Type' = 'application/json'
}
$body = @{
  q = 'noise cancelling headphones'
  catalogId = 123
  category = 'Electronics'
  subcategory = 'Headphones'
  sandbox = $false
} | ConvertTo-Json

$res = Invoke-RestMethod -Method Post -Uri "$env:A_SEARCH_URL_LIVE/search" `
  -Headers $headers -Body $body
# $res.searchId  $res.userId  $res.env  $res.enqueued
```

## Finding results (offline)

Workers write (see `docs/rclone-results.md`):

```
{env}/{source}/{userId}/{catalogId}/{searchId}.json
```

On the **MSSQL server**, the bucket is an **rclone mapped drive** under
`A_SEARCH_RCLONE_ROOT` (drive letter deploy-specific), e.g.:

```
S:\a-search\live\amazon\ABC12345\123\srch_01JEXAMPLE.json
S:\a-search\sandbox\awin\ABC12345\123\srch_01JEXAMPLE.json
```

Agent pattern:

1. After 200, note `searchId`, `userId`, `env`, `enqueued`.
2. Poll/wait for each `{source}` file under the mount (or S3 list) for those
   sources — timeout policy UNKNOWN (propose 60–180s with backoff).
3. Parse JSON product arrays; merge client-side if you need a single list.
4. Never read the **other** env’s tree.

If `enqueued` is `[]`, no files will appear — registry has nothing enabled
for that env.

## Live vs sandbox

| | live | sandbox |
|---|------|---------|
| Body | `sandbox: false` or omit | `sandbox: true` |
| URL | `A_SEARCH_URL_LIVE` | `A_SEARCH_URL_SANDBOX` |
| Results | `…/live/…` | `…/sandbox/…` |

Do not use a live JWT URL with sandbox paths or the reverse.

## What this skill does not cover

- Implementing amazon/ebay/awin workers — use that folder’s
  `a-search-<id>` skill with CWD in the provider directory
- Running the parts maintainer — `a-search-maintainer`
- Issuing JWTs — login product’s skill / human ops

## Do not

- Expect products in the `POST /search` body response
- Put `userId` in the JSON body as authority
- Mix live and sandbox queues or rclone roots
- Commit Bearer tokens into the repo or harvest receipts
