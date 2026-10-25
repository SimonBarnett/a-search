# FR #4891 SUMMARY

Seat: marchhare-8220. Branch: `fr-4891`. Worktree: `D:\bobfleet-build\job-fr-a-search-4891-mh8220`. No merge. No PR from this seat.

## What changed

1. **ONE `/parts` = APartsGateway** — removed `httpApi.addRoutes({ path: '/parts' ...})` from `cdk/lib/a-search-stack.js` (comment notes FR #4891 / APartsGateway). Embed `data-api-base` = `PartsGatewayApiUrl`.
2. **`enabled` replaces `init` on GUID markers** — `ensureWidget.js` seeds `enabled:'0'` + `hasresults:'0'` only (no `init` key). `hostFolderMeta.setEnabled` writes `enabled:'1'`; `setInit` is a thin alias that calls `setEnabled`.
3. **`/parts` no longer promotes IN→live** — promotion lives in `shared/widgets/promoteInToLive.js`. `maybeSetHasResults` (searchDone) calls it after a successful hasresults flip (empty IN → enabled=1 empty live → `no_parts`). Exported for #4918.
4. **pageParts / handler**
   - `enabled != 1` → `{status:'searching', parts:[], retryAfterMs:5000, init:0, enabled:0}`; handler **HTTP 202** + `Retry-After: 5`
   - `enabled=1` + parts → 200 `{status:'ok', init:1, enabled:1, ...}`
   - `enabled=1` empty → 200 `{status:'no_parts', ...}`
   - Handler passes `getObjectAnnotation` through for promote callers.
5. **Widget** — "Searching for parts..."; treat HTTP 202 as success; poll with retryAfterMs (5s doubling to 60s, ~10 min / hidden / removed); "No parts found" for no_parts / enabled=1 empty.
6. **Docs** — `cdk/README-parts-gateway.md`, `docs/components-piece.md` (single PartsGateway base; enabled/searching/no_parts).

## Tests

```
D:\Tools\node\node.exe --test tests/fr4891-parts-canonical-enabled.test.js tests/fr3968-parts-gateway.test.js tests/fr4917-hasresults-search-done.test.js
```

Result: **56 passed, 0 failed**.

Also green after updating related callers: fr4823, fr4107, fr3987 (104/104 with those included).

## Not done / parent owns

- `gh pr create` (parent)
- Live a-clubs migration of old `init=1` markers (Simon must stamp before any rewrite)
- #4918 agent monitor that resets hasresults after promote
