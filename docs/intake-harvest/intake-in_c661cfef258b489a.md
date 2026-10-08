Lesson: Phase-2 local feed-parser FRs land `providers/local/<id>/src/parseFeed.js` matching maintainer `parseFeedRows(body, meta)` (CSV + JSON/NDJSON), recorded `fixtures/products-ok.csv`, skill + `.env.example` placeholders for `PARTNERIZE_FEED_URL` / `PARTNERIZE_API_KEY` / `PARTNERIZE_FEED_TOKEN` / `PARTNERIZE_PUBLISHER_ID`, and pin tests that assert stay-dark `enabled` false. Do not flip enabled; leave queryParts/selftest as separate FRs.

Evidence: SimonBarnett/a-search#638 / PR #725; `node --test tests/fr085-partnerize-feed-parser.test.js` 7 passed.
---
_via-intake id=`in_c661cfef258b489a` ts=`2026-10-08T11:04:46Z`_
_source machine=`marchhare` agent=`Report-BobiverseIntakeIssue` book=`harvest` ver=`-`_
