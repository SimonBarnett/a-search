# ComponentsPiece shared login (merchants, partners, clubs)

**Repo:** SimonBarnett/a-search
**Locks:** FR-225 (#1235); shared entry FR-229 (#1239)
**Mocks:** docs/mocks/components-piece-auth/ (AL1 home, AL2 empty, AL3 error)
**Identity:** [identity.md](identity.md) -- 8-char tenant codes for userId

## Goal
One shared sign-in for merchants, partners, and clubs. Phase 5 has **no passwords**.

## Shared login entry (FR-229)

- One UI stack: `components-piece/login/` (`data-login-stack="shared"`).
- Session mint: `POST /auth/session` via `shared/auth/loginEntry.js`.
- Post-login path: `GET /auth/redirect?intent=merchant|partner|club`.
- Same session is valid across merchant, partner, and club intents after
  identity; role/intent attaches after contact is known.
- Fail-when: divergent per-role auth stacks (no password login modules).

## OAuth registry (pluggable)

- Auth providers live in a pluggable registry (implementation FR-226).
- Shortlist scaffolds (stay-dark until credentials): X, GitHub, Facebook,
  Google, Instagram -- plus a "More providers..." path.
- Each provider adapter **must return** at least one of: `email`, `phone`, or
  `contact` (normalized claims).
- **Fail closed** if the provider result has none of those contact fields --
  do not create a session; show AL3 ("Provider returned no contact").

## Email magic link / OTP

- Email-only path: user enters email, receives a **magic link** or **OTP**.
- No password field; no password required.
- Invalid/expired OTP or used magic link => AL3 error; user may request a new
  one.

## Fail closed (contact)

| Outcome | Behaviour |
|---------|-----------|
| OAuth with email/phone/contact | Session OK; map to identity userId |
| OAuth with no contact claims | Fail closed; no session |
| Email magic/OTP verified | Session OK |
| Password login | Not offered in Phase 5 |

## Out of scope (this doc)

- Live OAuth app credentials (deploy-time)
- SMS phone OTP productization
- Stripe Connect (payouts FR-222)
