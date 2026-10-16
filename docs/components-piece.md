# ComponentsPiece architecture + contracts (FR-195)

**Repo:** SimonBarnett/a-search
**Phase:** 5 - ComponentsPiece
**Status:** LOCKED docs park (issue #1183). No Lambda handlers or CDK routes in this FR.

Parent park: [feature-request-components-piece-2026-10-09.md](feature-request-components-piece-2026-10-09.md).
Widget identity + feature-request amendments / skillbook-layout / agent CWD: **FR-233** (#1347). This doc owns the architecture lock; FR-233 owns the amendment section in the feature-request file. Link both; do not duplicate.

## Goal

Park storage layout, Parts/Click contracts, trust boundaries, and database ownership for the host-page widget. Implementation FRs (handlers, CDK, agent) follow separately.

## Storage layout

Per-customer tree under the results mount (same S3 results bucket family as search results). Widget identity is a **widgetGuid** minted at embed-code creation (FR-232 rule 6). Do not use a URI-slug folder name for the widget tree.

Canonical prefix: `x:/{customerNumber}/{widgetGuid}/` (files below live under that prefix).

```
x:/{customerNumber}/
  site.md                      # site URL + affiliate skillbook
  top10.json                   # best deals rolled up across widgets
  {widgetGuid}/
    context.md                 # page-specific skill context
    searches.json              # queries the agent keeps for this widget
    in.json                    # normalised inbound search results (consumed then deleted)
    live.json                  # parts the widget serves
```

`live.json` is an ordered array of parts: id, title, price, merchant, image, affiliate target, freshness, plus partNumber, score, expiresAt when live.

`searches.json` shape: `{ queries: [{ q, intent, maxResults }] }`.

`in.json` item: `{ id, title, price, currency, merchant, image, url, seenAt }`.

## Contracts

Minimal public contracts (host-keyed; not JWT `POST /search`):

- `GET /parts?host&widgetGuid&offset&n` -> `{ customerNumber, widgetGuid, layout, parts[], nextOffset }`
- `GET /go?host&widgetGuid&part` -> `{ url }` (affiliate target or signup URL)
- `POST /widgets` (FR-232) -> mints/binds a widgetGuid for a host (embed-code creation)

Layout attribute on the widget selects `horizontal` / `vertical` / `fullscreen` (layout only; host CSS owns theme).

## Trust boundaries

- Widget never embeds affiliate destination URLs; clicks always go through `/go`.
- Unapproved hosts never receive affiliate destinations.
- Dual DNS TXT (LOCKED): Club TXT is required (club id). Partner TXT is optional (partnerId for agency commission). Partner TXT alone never unlocks destinations.
- A widgetGuid is bound to one host; other hosts -> 403 `widget_host_mismatch`.
- Parts/Click are host-keyed public APIs. Do not conflate with S5 JWT search accept.
- No secrets in `site.md`, skillbooks, mocks, or git.

## Database ownership

CAST IRON (FR-251 / #1365): all SQL tables ComponentsPiece creates or writes live in the a-search database (`a_search` live / **Recommended** sandbox DB name FR-146: `a_search_sandbox`), created by `db/migrations/`. madeiradb is **read-only** through `mdb.*` views. a-search must not modify madeiradb.

## Out of scope (this FR)

- No Lambda handlers
- No CDK routes
- No Chrome extension / agent dispatch implementation (see #1343 / #1344)
- FR-233 amendment text inside the feature-request file

## Related

- Feature request park: [feature-request-components-piece-2026-10-09.md](feature-request-components-piece-2026-10-09.md)
- Merchant / partner / Stripe docs lock: [components-piece-merchant.md](components-piece-merchant.md) (FR-214 / #1219)
- FR-232 widgetGuid: #1346
- FR-233 docs amendments: #1347
- FR-251 a-search DB: #1365
- FR-3373 host folder S3 Metadata/tags/annotations: #3373 ([FR-3373.md](fr/FR-3373.md)) --- zero-byte `{env}/x/{customerNumber}/` marker with `userid` Metadata; tags `hasdns` / `partnerid` / `hasupg`; annotation sidecars `_host.annotations.json` and `{widgetGuid}/_annotations.json`
- Mocks: `docs/mocks/components-piece/` (vision Screens W1-W3)
