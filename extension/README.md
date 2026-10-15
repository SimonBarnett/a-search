# a-search Chrome Extension (#1344)

Manifest V3 content script + service worker.

## Behaviour

- Calls `GET /ext/status?host=` on load / host change.
- **Inert** (zero DOM) when `enabled` is false or `clubId` is null (Club TXT gate).
- When enabled, injects a 36px Shadow DOM top bar (Login shell).
- JWT is stored only via `chrome.storage.session` in `background.js` -- never `localStorage` / page DOM.
- Edit buttons attach to `.a-search-widget[data-widget-guid]` when the bar is active.

## Out of scope in this landing

- Live `chrome.identity.launchWebAuthFlow` against production Cognito/OAuth.
- Full Edit dialog (layout / context / remove) UI polish -- APIs are on entry (`PATCH /widgets/{guid}`, `POST .../feedback`).
- FR-234 stats chip / Performance tab (routes remain 501 until FR-234).

## Pins

`tests/fr1344-chrome-extension.test.js`
