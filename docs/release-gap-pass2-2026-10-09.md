# a-search gap pass 2 (AWS installable)

Date: 2026-10-09
Baseline: origin/main after docs/mrb-958
Prior: FR-121..127 (#950-#956), FR-128..150 (#964-#986)

## New gaps found

| Gap | FR | Issue |
|-----|----|------:|
| jose missing for JWT JWKS | FR-151 | #994 (**Yes** - jose dep + stage-entry; pin fr151) |
| /selftest still empty providers[] | **Yes** (FR-152) | #995 |
| No API CORS | FR-153 | #996 |
| S3 SSE + BlockPublicAccess | FR-154 | #997 |
| Cost tags | FR-155 | #998 |
| Stack stage suffix | FR-156 | #999 |
| API access logs + throttle | FR-157 | #1000 |
| Intake egress UNKNOWN | FR-158 | #1001 (**Yes** - measure + A_SEARCH_INTAKE_URL + fail-soft intake_egress_blocked) |
| shared files[] missing identity/ | FR-159 | #1002 |
| Performance still injectable stub | FR-160 | #1003 |
| Endpoint skill deploy pointers | FR-161 | #1004 |
| SQS SSE | FR-162 | #1005 |
| Destroy/rollback docs | FR-163 | #1006 |
| visibilityTimeout <= worker timeout | FR-164 | #1007 |
| Explicit Lambda memorySize | FR-165 | #1008 |

## Explicitly still OOS for v0.1

- Stay-dark provider enablement
- Amazon Creators API
- WAF WebACL
- Multi-region
