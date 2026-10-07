'use strict';

/**
 * Entry HTTP handler stub (FR-003 scaffold).
 *
 * Later FRs:
 * - FR-004: JWT Bearer verify → userId claim
 * - FR-005: POST /search accept → 200 { searchId, accepted, userId, env, enqueued }
 * - FR-006: fan-out one SQS message per enabled registry source
 *
 * This module must not load provider secrets.
 */

/**
 * @param {object} _event - API Gateway / Lambda-style event (shape TBD at deploy)
 * @param {object} [_context]
 * @returns {Promise<{ statusCode: number, headers: Record<string, string>, body: string }>}
 */
async function handler(_event, _context) {
  return {
    statusCode: 501,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      accepted: false,
      error: 'not_implemented',
      message: 'entry stub — JWT verify and fan-out land in FR-004..FR-006',
    }),
  };
}

module.exports = { handler };
