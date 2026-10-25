# Invite backends (Awin + Rakuten)

FR #5065: `tools/invite.ps1` registers `awin` and `rakuten`.

| Provider | Discovery / status | Apply | Records | Message cap | Report |
|---|---|---|---|---|---|
| awin | Join Programmes UI | Playwright | `awin/_invites/{id}/` | 149 | `logs/awin-invite/{date}.json` |
| rakuten | Advertisers + Partnerships APIs | Playwright (no public apply POST) | `rakuten/_invites/{mid}/` | 500 | `logs/rakuten-invite/{date}.json` |

Rakuten seed skips: Dream Home Store 54397 (live); pending 54054, 54318, 54090, 54110, 53579; Christow by name until Partnerships API supplies a MID. Captcha / missing browser: exit 2, notify Simon, no retry loop.

Do not add Rakuten `_import/` or merchant feeds (`download` / `dbimport` stay unimplemented).
