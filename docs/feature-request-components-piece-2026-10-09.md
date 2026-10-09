# Feature request: a-search ComponentsPiece (host widget + Parts/Click APIs)

**Repo:** SimonBarnett/a-search  
**Date:** 2026-10-09  
**Baseline:** origin/main @ 065e457 (docs park branch)
**Phase:** 5 - ComponentsPiece (host-page widget)  
**Status:** APPROVED for docs park 2026-10-09 (plan-20261009-175258); implementation FRs filed separately

## Ultimate objective

A host page embeds a thin JS widget that shows live affiliate parts for that
page's host+URI. Parts and click routing come from a-search APIs backed by a
per-customer S3 tree and a Customers DB; an agent fills and maintains the tree.
Unapproved hosts never receive affiliate destinations until a DNS TXT check
passes (otherwise the click response is the signup URL only).

## Shape

Primary (one): **service**

Hybrid note: Product remains the a-search **service** (APIs + agent + S3 + DB).
The embeddable JS widget is **delivery** on host pages. Club Madeira (or other)
host HTML stays outside this repo; only the widget script and Parts/Click
endpoints live here. Existing `POST /search` JWT fan-out is unchanged.

Update vs current `docs/vision.md` Screens note: gateway mocks stay; this FR
adds widget mocks under `docs/mocks/components-piece/`.

LOCKED

## Success

| id | metric | target | how measured | fail-when |
|----|--------|--------|--------------|-----------|
| CP1 | Parts page for known host | `GET /parts?host&uri&offset&n` returns 200 with `customerNumber`, `parts[]`, `nextOffset` from `live.json` slice | `tests/components-piece-parts.test.js` fixture tree | 5xx, missing customerNumber, or wrong slice length |
| CP2 | First-sight bootstrap | Unknown host inserts Customers row, creates S3 customer tree + empty `live.json`, returns empty parts page | same pin: first call creates; second call reuses customerNumber | No DB row, no S3 folder, or new number every call |
| CP3 | Click approved | Approved host `GET /go?host&uri&part` returns `{ url }` affiliate target from `live.json` without embedding that URL in the widget HTML | `tests/components-piece-go.test.js` | Affiliate URL in widget markup, or 200 with empty url |
| CP4 | Click unapproved + TXT | Unapproved host: DNS TXT present -> mark approved + return destination; TXT absent -> signup URL only (never affiliate target) | go pin with stub DNS | Affiliate URL leaked when TXT missing |
| CP5 | DNS cache | After approval, subsequent clicks do not call DNS again (row `approved` / cached flag) | go pin asserts stub DNS call count == 1 across 2 clicks | DNS on every click after approve |
| CP6 | Widget modes | Widget reads host+URI, pages Parts API, renders `horizontal` / `vertical` / `fullscreen` from layout attribute only | `tests/components-piece-widget.test.js` + mocks | Mode changes theme CSS, or wrong host/uri captured |
| CP7 | Host CSS inherit | Widget sets no competing theme; host page styles drive appearance | pin: widget stylesheet has no color/font theme rules (layout only) | Hard-coded brand theme in widget CSS |
| CP8 | Agent site pass | Missing `site.md` -> agent writes affiliate skillbook + seeds `top10.json` | `tests/components-piece-agent-site.test.js` | Agent skips site.md or writes secrets |
| CP9 | Agent maintain | With `site.md`: per URI folder maintain `context.md`, `searches.json`, ingest `in.json` into `live.json`, delete `in.json`, prune dead, roll `top10.json` | agent pin with fixture folders | `in.json` left after run, or agent writes affiliate URLs into widget |

## Architecture

```
Host page
  [JS widget] --GET /parts?host&uri&offset&n--> [Parts API] --> Customers DB
                      |                              |
                      |                              +--> S3 x:/{customerNumber}/...
                      |
                 --GET /go?host&uri&part--------> [Click API] --> DB approved?
                                                      | yes -> live.json target
                                                      | no  -> DNS TXT
                                                      |        yes -> approve + target
                                                      |        no  -> signup URL only

Agent (offline)
  reads/writes S3 customer tree; consumes normalised in.json;
  only writer of live.json and top10.json
  Affiliate search sources --> in.json (normalised hits)
```

### Storage layout (LOCKED for this FR)

```
x:/{customerNumber}/
  site.md                 # site URL + affiliate skillbook
  top10.json              # best deals rolled up from all URI searches
  {uri-slug}/
    context.md            # page-specific skill context
    searches.json         # queries the agent keeps for this page
    in.json               # normalised inbound search results (consumed then deleted)
    live.json             # parts the widget serves
```

`uri-slug` is a stable encoding of the path (and query when it changes page
intent). `live.json` is an ordered array of parts: id, title, price, merchant,
image, affiliate target, freshness, plus partNumber, score, expiresAt when live.

### Contracts (minimal)

- `GET /parts?host&uri&offset&n` -> `{ customerNumber, parts[], nextOffset }`
- `GET /go?host&uri&part` -> `{ url }` (affiliate target or signup)
- `in.json` item -> `{ id, title, price, currency, merchant, image, url, seenAt }`
- `live.json` item -> same, plus `partNumber`, `score`, `expiresAt`
- `searches.json` -> `{ queries: [{ q, intent, maxResults }] }`

### Trust boundaries

- Widget never embeds affiliate destination URLs; clicks always go through `/go`.
- Unapproved hosts never receive affiliate destinations.
- Parts/Click are **host-keyed public APIs** (not JWT `POST /search`). Do not
  conflate with S5 JWT search accept.
- No secrets in `site.md`, skillbooks, mocks, or git.

## Screens

| id | file | state |
|----|------|-------|
| W1 | docs/mocks/components-piece/home.html | parts strip with N cards (horizontal) |
| W2 | docs/mocks/components-piece/empty.html | known host, empty live.json |
| W3 | docs/mocks/components-piece/error.html | API/DNS/signup gate failure states |

## Gap vs origin/main @ 065e457 (docs park branch)

| area | on main? | note |
|------|----------|------|
| GET /parts, GET /go | no | no handlers/docs |
| Customers DB (host, customerNumber, approved) | no | madeiradb inventory is catalogue Parts, not host customers |
| S3 `x:/{customerNumber}/` tree | no | results tree is `{env}/{source}/{userId}/...` |
| Embeddable widget JS | no | vision: Club Madeira UI outside repo |
| Agent site/URI maintain for widget tree | no | workers write search result JSON only |
| DNS TXT approval | no | |
| Mocks components-piece | no | gateway + performance + selftest mocks only |

## Small FRs (drafts - unfiled until approve)

See `docs/fr/FR-195.md` - `FR-212.md` and `SMALL-FRS.tsv`. Anti-omnibus: one
GitHub issue per FR after approval; park with Refs not Closes.

## Out of scope

- Changing JWT `POST /search` fan-out or provider registry enablement
- Club Madeira host page HTML/CSS (host owns theme)
- Stamping UAT / production deploy from Plan seat
- Omnibus single issue for the whole Phase 5 backlog

## UNKNOWN

- Exact DNS TXT name/value format and signup page URL
- Whether Parts/Click share entry Lambda or a new `components/` (or `widget/`) folder
- Mapping of logical `x:` customer tree onto the existing results bucket vs a
  dedicated prefix/bucket (rclone letter may differ from search results mount)
- Customers table physical name / schema in MSSQL vs a small DynamoDB table
- Rate limits / abuse controls on public `/parts` and `/go`

## Issued (Refs)

Implementation issues (leave open; docs park PR uses Refs not Closes):

- Refs #1183 #1184 #1185 #1186 #1187 #1188 #1189 #1190 #1191 #1192 #1193 #1194 #1195 #1196 #1197 #1198 #1199 #1200
- Index: docs/fr/ISSUED-PHASE5.tsv
- Plan session: plan-20261009-175258