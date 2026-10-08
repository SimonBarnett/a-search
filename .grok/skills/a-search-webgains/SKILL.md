

## Harvested lessons (intake)

- Phase-2 webgains local search: injectable queryParts SELECT dbo.Parts Source=webgains DeletedAt IS NULL, worker queryParts->normalizePart(WEBGAINS_CAMPAIGN_ID/wgcampaignid)->writeResults; registry enabled stays false both envs.
