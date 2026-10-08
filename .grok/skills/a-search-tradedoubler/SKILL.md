

## Harvested lessons (intake)

- Phase-2 tradedoubler local search: injectable queryParts SELECT dbo.Parts Source=tradedoubler DeletedAt IS NULL; worker queryParts->normalizePart(TRADEDOUBLER_AFFILIATE_ID/tduid)->writeResults; registry enabled stays false both envs.
