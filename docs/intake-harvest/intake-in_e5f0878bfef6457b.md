MRB (light triage): is the lesson useful, generalised, non-duplicate, and a fit for this repo's vision/AGENTS.md? PASS -> merge. Not useful / off-vision -> close with a one-line reason (board CLOSED not-useful). Duplicate -> close citing the existing lesson. Wrong owner -> re-file or MOVED (FR #3299); leave OPEN if the owner repo does not exist yet. Plan content only (requirements, designs, product decisions, FR/issue lists from a Plan seat) -> close 'plan content, not a lesson' (never hold it OPEN); move any how-to-plan lesson inside to SimonBarnett/skills-visionary.

## Lesson
Folder download spinner: hostile --args-env pin must match `& $nodeExe $js --args-env` (not only `$node $runner`); still forbid JSON argv handoff.

## Evidence
FIX SimonBarnett/a-search#4929 — `tests/mrb4169-hostile-fr4167-winps.test.js` failed because `Invoke-FolderDownload.ps1` now invokes via `Invoke-FolderToolWithSpinner` with `$nodeExe`/`$js`.

## Target book
`.grok/skills/harvest-agent-skills/SKILL.md`
---
_via-intake id=`in_e5f0878bfef6457b` ts=`2026-10-25T12:55:47Z`_
_source machine=`marchhare` agent=`Report-BobiverseIntakeIssue` book=`harvest-agent-skills` ver=`-`_
