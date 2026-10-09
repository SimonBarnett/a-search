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
| CP4 | Click unapproved + Club TXT | Unapproved host: Club DNS TXT (club id) required to approve + return destination; Club absent -> signup URL only. Partner TXT optional (partnerId for agency commission); Partner alone never unlocks destinations | go pin with stub dual DNS | Affiliate URL when Club TXT missing, or Partner-only unlocks |
| CP5 | DNS cache | After Club approval (and optional Partner read), subsequent clicks do not re-query DNS (approved + clubId + optional partnerId cached) | go pin asserts Club DNS call count == 1 across 2 clicks | DNS on every click after approve |
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
                                                      | yes -> live.json target (+ partnerId if cached)
                                                      | no  -> DNS: Club TXT (required) + Partner TXT (optional)
                                                      |        Club yes -> approve, store clubId, optional partnerId, target
                                                      |        Club no  -> signup URL only (Partner alone never unlocks)

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
- Dual DNS TXT (LOCKED): Club TXT is required (club id; self-serve or agency). Partner TXT is optional (partner id so a digital agency that set up the host can claim commission). Partner TXT alone never unlocks destinations.
- Parts/Click are **host-keyed public APIs** (not JWT `POST /search`). Do not
  conflate with S5 JWT search accept.
- No secrets in `site.md`, skillbooks, mocks, or git.

## Screens

| id | file | state |
|----|------|-------|
| W1 | docs/mocks/components-piece/home.html | parts strip with N cards (horizontal) |
| W2 | docs/mocks/components-piece/empty.html | known host, empty live.json |
| W3 | docs/mocks/components-piece/error.html | API/DNS/signup gate failure states |
| MW1 | docs/mocks/components-piece-merchant/home.html | Merchant wizard - provider + Stripe confirmed |
| MW2 | docs/mocks/components-piece-merchant/empty.html | Merchant wizard - not connected |
| MW3 | docs/mocks/components-piece-merchant/error.html | Merchant wizard - session/payment errors |
| PW1 | docs/mocks/components-piece-partner/home.html | Partner/club register + copy widget |
| PW2 | docs/mocks/components-piece-partner/empty.html | Partner/club before registration |
| PW3 | docs/mocks/components-piece-partner/error.html | Partner/club errors / payout setup |
| AL1 | docs/mocks/components-piece-auth/home.html | Shared login - OAuth + email OTP |
| AL2 | docs/mocks/components-piece-auth/empty.html | Shared login - signed out |
| AL3 | docs/mocks/components-piece-auth/error.html | Shared login - no contact / OTP error |

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



## Amendment 2026-10-09b - Merchant wizard, partner/club pages, Stripe

LOCKED from Plan seat (a-search same repo):

### Merchants (Shopify / Wix / WooCommerce)

- Signup **wizard**: merchant selects catalogue provider (Shopify, Wix, Woo).
- Wizard uses the merchant's **logged-in session** on that platform to return
  shop connection details (prompt login if not already signed in).
- Merchant **subscriptions** are paid **monthly via Stripe**.
- Signup **cannot complete** until Stripe **Customer + subscription + first
  payment confirmation** succeed.
- Merchants on monthly subscription **do not pay commission** (subscription
  replaces commission charges).

### Partner registration + widget copy pages

- **Partner registration widget** issues / sends the partner their **partner
  code for DNS**, with instructions hosted on **smartcatalogue.uk**.
- A page lets them pick **horizontal / vertical / fullscreen** and **copy
  widget embed code** to paste into their site.
- The **same page also exists on clubmadeira.uk** (clubs).
- **Anyone** can copy the widget code; the widget **self-configures from
  where it is placed** (host + URI), not from hardcoded host in the snippet.

### Payouts (Stripe)

- Partner and club **payouts** use Stripe.
- Partners/clubs are **not** required to have a Stripe payout account until
  they want to be paid out.
- **Partners who pay monthly do not pay commission** (monthly partner plan;
  commission obligation does not apply to those partners).

### Shape note

Primary remains **service**. Wizard + partner/club copy pages are **delivery
websites** shipped in a-search and served / linked from smartcatalogue.uk and
clubmadeira.uk.

### New Success rows (additive)

| id | metric | target | how measured | fail-when |
|----|--------|--------|--------------|-----------|
| CP10 | Merchant wizard provider pick | Wizard offers Shopify, Wix, Woo; selected provider drives OAuth/session connect | `tests/components-piece-merchant-wizard.test.js` + mocks | Missing provider or connect ignores selection |
| CP11 | Shop connection via session | Logged-in platform session returns shop connection details; prompts login when absent | merchant connect pin with fixture session | Completes without shop details |
| CP12 | Merchant Stripe gate | Signup finishes only after Stripe Customer + subscription + first payment confirmed | stripe stub pin | Finish without payment confirmation |
| CP13 | No merchant commission on sub | Monthly-subscribed merchant is not charged commission fees | billing pin / docs rule | Commission charged on top of active monthly sub |
| CP14 | Partner code delivery | Partner registration sends partner DNS code + smartcatalogue.uk instructions | partner-register pin | Code missing or instructions URL wrong |
| CP15 | Widget copy page | Page on smartcatalogue.uk and clubmadeira.uk: mode select + copy embed; snippet has no hardcoded host | mocks + pin | Hardcoded host in snippet, or page missing on either site |
| CP16 | Self-configuring widget | Embed uses placement `location.host` + URI only | widget pin | Snippet requires manual host field |
| CP17 | Payout Stripe optional | Partner/club can operate without payout Stripe until payout requested | docs + pin | Forced Connect at partner register |
| CP18 | Monthly partner no commission | Partner on monthly plan is not charged commission | billing pin / docs rule | Commission charged to monthly-paying partner |

### New small FRs

FR-214..FR-224 (see `docs/fr/`). File after approve.




## Amendment 2026-10-09c - Shared login (OAuth pluggable + email OTP)

LOCKED from Plan seat:

### Who

Merchants, partners, and clubs share the same login surfaces (role chosen or
inferred after identity). Applies to wizard, partner registration, and club
flows.

### OAuth (pluggable)

- Support **all OAuth providers that return at least one of:** email, phone, or
  other durable **contact** identifier.
- Providers are a **registry** (add without rewriting core auth). Shortlist
  adapters may include X, GitHub, Facebook, Instagram, Google, and others;
  enabling a provider is config + credentials (Secrets Manager), not a core
  rewrite.
- Fail closed: if a provider returns **none** of email / phone / contact,
  reject that login (do not create a silent orphan identity).

### Email-only path

- User may **enter email** only.
- Path: **magic link / OTP to email** (no password required for this Phase).

### Identity link

- Successful login maps to the 8-char identity code shape in `docs/identity.md`
  (mint or attach). Do not invent a second tenant id scheme.

### New Success rows

| id | metric | target | how measured | fail-when |
|----|--------|--------|--------------|-----------|
| CP19 | Pluggable OAuth registry | New provider = registry entry + adapter; core auth unchanged | `tests/components-piece-auth-registry.test.js` | Core rewrite required for new provider |
| CP20 | Contact claim required | OAuth accept only when email OR phone OR contact present | auth pin with fixture profiles | Accept with empty contact set |
| CP21 | Email magic/OTP | Enter email -> magic link or OTP verifies and session starts | `tests/components-piece-auth-email.test.js` | Password-only gate or unverified email session |
| CP22 | Shared roles | Same login serves merchant / partner / club entry points | pin + mocks | Separate incompatible auth stacks per role |

### New small FRs

FR-225..FR-231 (see `docs/fr/`). File after approve.


## Out of scope

- Changing JWT `POST /search` fan-out or provider registry enablement
- Club Madeira host page HTML/CSS (host owns theme)
- Stamping UAT / production deploy from Plan seat
- Omnibus single issue for the whole Phase 5 backlog

## UNKNOWN

- Exact OAuth client ids / redirect URIs (deploy-time Secrets Manager)
- Which shortlist providers are enabled=true on day one vs stay-dark
- OTP length / magic-link TTL defaults beyond fixtures
- Whether phone OTP is in Phase 5 or email-only for the non-OAuth path

- Merchant Stripe Price/Product ids (deploy-time); Connect account type for payouts
- Exact OAuth app ids for Shopify / Wix / Woo (deploy-time)
- Whether smartcatalogue.uk / clubmadeira.uk are reverse-proxy or static publish of a-search pages
- Merchant Stripe secret keys in Secrets Manager naming (no values in git)

- Exact public DNS TXT record names (values carry clubId / optional partnerId); signup page URL
- Whether Parts/Click share entry Lambda or a new `components/` (or `widget/`) folder
- Mapping of logical `x:` customer tree onto the existing results bucket vs a
  dedicated prefix/bucket (rclone letter may differ from search results mount)
- Customers table physical name / schema in MSSQL vs a small DynamoDB table
- Rate limits / abuse controls on public `/parts` and `/go`



## Amendment 2026-10-09 - Dual DNS TXT

LOCKED clarification from Plan seat:

- There are two DNS TXT concepts: Club and Partner.
- There MUST be a club id (operator may have set Club TXT themselves).
- There MAY be a partner key (digital agency adds Partner TXT with their partner id to claim commission).
- Club TXT gates approval; Partner TXT attributes commission only.

Related: FR-196 (#1184), FR-200 (#1188), FR-213 (new).

## Issued (Refs)

Implementation issues (leave open; docs park PR uses Refs not Closes):

- Refs #1183 #1184 #1185 #1186 #1187 #1188 #1189 #1190 #1191 #1192 #1193 #1194 #1195 #1196 #1197 #1198 #1199 #1200 #1204
- Index: docs/fr/ISSUED-PHASE5.tsv
- Plan session: plan-20261009-175258
## Issued Phase 5b (Refs)

- Refs #1219 #1220 #1221 #1222 #1223 #1224 #1225 #1226 #1227 #1228 #1229
- Index: docs/fr/ISSUED-PHASE5B.tsv

## Issued Phase 5c (Refs)

- Refs #1235 #1236 #1237 #1238 #1239 #1240 #1241
- Index: docs/fr/ISSUED-PHASE5C.tsv
