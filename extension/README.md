# a-search Chrome Extension (#1344 / #2078)

Manifest V3 content script + service worker.

## Behaviour

- Calls `GET /ext/status?host=` on load / host change.
- **Inert** (zero DOM) when `enabled` is false or `clubId` is null (Club TXT gate).
- When enabled, injects a 36px Shadow DOM top bar.
- Logged-out: Login -> `chrome.identity.launchWebAuthFlow` against shared login
  (`/components-piece/login/?extension=1&redirect_uri=`), JWT from `#access_token=`.
- Logged-in: commission chip, Stripe, Claim (club role only), Upgrade, Create widget
  (clipboard snippet), Logout. Edit dialog on `.a-search-widget[data-widget-guid]`.
- JWT is stored only via `chrome.storage.session` in `background.js` -- never
  `localStorage` / page DOM.

## Pins

- `tests/fr1344-chrome-extension.test.js` (gate + APIs)
- `tests/fr2078-chrome-identity-bar.test.js` (identity + bar + edit)

## Out of scope

- FR-234 stats chip / Performance tab (routes remain 501 until FR-234).
