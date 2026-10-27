# Awin `_invite` — invite tool instructions

Used by `invite` (`C:\ai\a-search\tools\invite.ps1`).

- Entry: `invite.mjs` (Playwright Join Programmes / notJoined)
- Profile (host): `C:\ai\a-search\awin-agent\profile\`
- node_modules / cwd: `C:\ai\a-search\awin-agent`
- Invite *records* stay at `awin/_invites/{id}/` (note the trailing **s**)

```powershell
cd S:\a-affiliates\awin
invite -Max 3
invite -Live -Max 2 -Otp <code>
```
