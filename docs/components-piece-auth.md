# ComponentsPiece shared login (merchants, partners, clubs)

**Repo:** SimonBarnett/a-search
**Locks:** FR-225 (#1235)
**Mocks:** docs/mocks/components-piece-auth/ (AL1 home, AL2 empty, AL3 error)
**Identity:** [identity.md](identity.md) -- 8-char tenant codes for userId

## Goal
One shared sign-in for merchants, partners, and clubs. Phase 5 has **no passwords**.

## OAuth registry (pluggable)

- Auth providers live in a pluggable registry (implementation FR-226).
- Shortlist scaffolds (stay-dark until credentials): X, GitHub, Facebook,
  Google, Instagram -- plus a "More providers..." path.
- Each provider adapter **must return** at least one of: `email`, `phone`, or
  `contact` (normalized claims).
- **Fail closed** if the provider result has none of those contact fields --
  do not create a session; show AL3 ("Provider returned no contact").

## Email magic link / OTP

- Email-only path (partners/clubs/returning logins): user enters email, receives a
  **magic link** or **OTP** (FR-228: `POST /auth/email/request|verify`).
- No password field; no password required.
- Invalid/expired OTP or used magic link => AL3 error; user may request a new
  one.
- Verified session JWT carries `contactVerified: true`.

## Merchant SMS OTP

- Merchant signup on smartcatalogue.uk verifies via **SMS OTP** (FR-228):
  E.164 phone (UK `+44` default), 6-digit code, 10-minute TTL, max 5 attempts,
  rate-limited sends. Injectable `shared/notify/smsSender.js`.
- Codes stored hashed in `a_search.dbo.OtpCodes` (never madeiradb `SystemOTPs`).
- Add-shop / merchant gates fail closed until contact is verified
  (`contact_unverified`).

## Fail closed (contact)

| Outcome | Behaviour |
|---------|-----------|
| OAuth with email/phone/contact | Session OK; map to identity userId |
| OAuth with no contact claims | Fail closed; no session |
| Email magic/OTP verified | Session OK |
| Merchant SMS OTP verified | Session OK |
| Password login | Not offered in Phase 5 |
| Unverified session on Add-shop | 403 contact_unverified |

## Out of scope (this doc)

- Live OAuth app credentials (deploy-time)
- Live SNS/Twilio credentials in git
- Stripe Connect (payouts FR-222)
