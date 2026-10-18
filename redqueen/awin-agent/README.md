# Daily Awin onboarding agent (FR #4123)

Recreates Merc's Awin publisher onboarding as a **daily scheduled agent on redqueen**.
Writes only to `s3://a-affiliates/awin/{advertiserid}/`. Never writes to madeiradb
or the old partner portal. Merc remains the reference / backup operator.

## Runtime order

1. **Grok** (when weekly tokens remain)
2. **Cursor** fallback when Grok is exhausted

Schedule the seat / Task Scheduler to pick Grok first. This Node entry
(`src/run.js`) is the deterministic lock + folder + report core the agent drives.

## Credentials

| Item | Location |
|------|----------|
| Awin UI login | `C:\passwords\awin.secret.txt` (SYSTEM + Administrators ACL only) |
| Format | Merc: CRLF, **line 1 email**, **line 2 password** (password field = line 2 only) |
| OTP | Not in the file. On `id.awin.com/u/mfa-otp-challenge` (or captcha): **stop**, ask Simon, do not loop |
| Optional API | `apitoken` on `a-affiliates/awin/` provider marker (secure entry; read-side only) |

Agents never create, copy, or print the secret file. On redqueen, fill the password field in-process from line 2
(no temp file, no clipboard, never log it).

## Config / limits

| Env / flag | Default | Meaning |
|------------|---------|---------|
| `-DryRun` / `--dry-run` | off | Sign-in optional/simulated; list invites/joins/creates/updates; **no** Awin side effects, **no** S3 writes |
| `AWIN_AGENT_MAX_INVITES` | `20` | Daily invite cap |
| `AWIN_AGENT_MAX_JOINS` | `20` | Daily join cap |
| `AWIN_AGENT_LOCK` | `%ProgramData%\a-search\awin-agent.lock` | Single-instance lock |
| `AWIN_AGENT_REPORT_DIR` | `C:\ai\a-search\logs\awin-agent` | Daily JSON reports |
| `A_AFFILIATES_BUCKET` | `a-affiliates` | Target bucket |
| `AWIN_SECRET_FILE` | `C:\passwords\awin.secret.txt` | UI secret path |

Second concurrent start exits **0** with report `alreadyRunning: true` / code `already_running`.

## Report format

`{reportDir}\{yyyy-mm-dd}.json` and one JSON line on stdout:

- `counts`: invited, joined, approved, foldersCreated, foldersUpdated, noFeedFollowUps, notifySimon
- id arrays for each (advertiser ids only)
- **Never** passwords, OTP, feed API keys, or raw `apitoken`

Do **not** write reports under `a-affiliates/awin/` (that prefix is advertiser folders + `AGENT.md` only).

## Folder contract

See `docs/a-affiliates.md` and `s3://a-affiliates/awin/AGENT.md`. Summary:

- Marker `awin/{advertiserid}/`; `affiliateid` = `awinmid` = advertiser id
- Merge existing metadata; never recreate; never reset `lastdownload` / `laststatus` / `lastsize`
- `feedurl` keeps `{feedapikey}` placeholder; `enabled=1` only with verified feed
- No-feed follow-up: `enabled=0`, `disabledreason=nofeed`

## Skillbooks

Under .grok/skills/a-search-awin-agent-* (publisher sign-in, welcome monitor,
feed link pulls, merchant feed key, daily signups, global recommendations,
invite metrics, no-feed follow-up, merc-hostile-mrb).

FR #4126: Merc operator playbook bodies (from #4123 comments 1-4) are pasted into
those skills. Do not invent Awin UI element ids beyond what Merc documented.
Sign-in on redqueen is in-process from C:\passwords\awin.secret.txt. Join /
invite messages are unique per advertiser and at most 149 characters (Awin).

Instruction load order: s3://a-affiliates/AGENTS.md then awin/AGENT.md
(see AGENTS.md in this folder).

## Manual run

```powershell
cd C:\ai\a-search
node redqueen\awin-agent\src\run.js -DryRun
# live (requires secret file + browser injection from the agent seat):
node redqueen\awin-agent\src\run.js
```

Register a daily task (optional):

```powershell
.\redqueen\awin-agent\install\Register-AwinAgentTask.ps1
```

## Tests

```bash
node --test tests/fr4123-awin-onboarding-agent.test.js tests/fr4126-awin-merc-skillbooks.test.js
```
