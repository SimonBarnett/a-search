# AGENT.md --- a-affiliates/cj (FR #5066)

CJ Affiliate Network invite / join flow for Club Madeira (publisher CID **8103947**).

## Status

`enabled=0` until the publisher account is activated (W-8BEN-E + payment; see a-search #5057). While inactive, Advertiser Lookup returns **403** and `invite` exits `cj_account_not_active` (code **5**) with no S3 writes and no token print.

## Invite

```powershell
cd S:\a-affiliates\cj
invite -Max 3              # dry-run (default)
invite -Live -Max 10       # Account Manager apply (supervised)
```

- Discovery: Advertiser Lookup API (`notjoined` / `joined`), XML, **25 calls/minute**, max **100**/page.
- Apply: **UI only** (members.cj.com Account Manager — no public join API).
- Cooldown: 90 days on `cj/_invites/{advertiserCid}/` (`invitedat`, `firstinvitedat`, `invitecount`, `invitemsg`, `source`).
- Skip advertisers that already have a `cj/{cid}/` folder.
- Message limit: **500** characters (CJ Account Manager). Prefer hobby / RC categories when ranking.
- Report: `C:\ai\a-search\logs\cj-invite\{yyyy-mm-dd}.json` (ids/names/counts only).
- Secrets file (redqueen): `C:\passwords\cj.secret.txt` — line 4 = personal access token, line 5 = website id. Never print values.
- Worker env (search): `CJ_API_TOKEN`, `CJ_COMPANY_ID`, `CJ_WEBSITE_ID` — separate from invite file layout.

## Website / PID

Applications are per company; tracked links are per PID. Default targeting: Club Madeira PID **101908183** (Smart Catalogue **101908184** optional). Confirm with Simon before dual-PID campaigns.

## Out of scope here

- Live GraphQL product search worker (`providers/live/cj`) fixes (#5057).
- Feed download / dbimport (CJ has no a-affiliates feed import on this path).
