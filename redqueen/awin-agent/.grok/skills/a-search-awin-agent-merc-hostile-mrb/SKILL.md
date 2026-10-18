---
name: a-search-awin-agent-merc-hostile-mrb
description: >
  FR #4123 redqueen daily Awin onboarding agent — merc-hostile-mrb checklist.
  Use in redqueen/awin-agent or /a-search-awin-agent-merc-hostile-mrb.
---

# merc-hostile-mrb checklist (Awin agent)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never commit or print Awin passwords, OTP codes, or feed API keys.

## Hostile MRB checklist (FR #4123)
- [ ] DryRun makes no Awin side effects and no S3 writes
- [ ] Folder writes merge, not recreate; `last*` preserved
- [ ] Fake password / feed key / apitoken never in stdout, logs, reports, or advertiser metadata
- [ ] OTP challenge → stop + notify Simon (no retry loop)
- [ ] Daily limits enforced; second instance `already_running`
- [ ] Skillbooks did not invent Merc UI ids; PENDING sections filled from Merc when available
- [ ] Docs pointer from `docs/a-affiliates.md`

## Merc checklist body
PENDING: replace/extend with Merc's own hostile MRB checklist when supplied.