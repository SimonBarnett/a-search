

## Harvested lessons (intake)

- When a shop-sync docs pin tip is behind main after an earlier PASS, fold origin/main once, re-run the handler(event, context, deps) pin, and DONE on the new SHA. Do not re-send the old DONE while the tip is behind.
