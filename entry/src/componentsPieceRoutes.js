'use strict';

/**
 * FR-208: route matchers + stubs for ComponentsPiece / extension account paths.
 * Real handlers land in FR-232 / #1344 / #1345 / FR-234. Until then: 501.
 */

/**
 * @param {string} method
 * @param {string} path
 * @returns {string|null} route id or null
 */
function matchComponentsPieceRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'POST' && p === '/widgets') return 'POST /widgets';
  if (m === 'PATCH' && /^\/widgets\/[^/]+$/.test(p)) return 'PATCH /widgets/{widgetGuid}';
  if (m === 'POST' && /^\/widgets\/[^/]+\/feedback$/.test(p)) {
    return 'POST /widgets/{widgetGuid}/feedback';
  }
  if (m === 'GET' && p === '/widgets/stats') return 'GET /widgets/stats';
  if (m === 'GET' && /^\/widgets\/[^/]+\/stats$/.test(p)) {
    return 'GET /widgets/{widgetGuid}/stats';
  }
  if (m === 'POST' && p === '/w/events') return 'POST /w/events';
  if (m === 'GET' && p === '/account/commission') return 'GET /account/commission';
  if (m === 'POST' && p === '/account/stripe/link') return 'POST /account/stripe/link';
  if (m === 'POST' && p === '/account/payouts') return 'POST /account/payouts';
  if (m === 'POST' && p === '/account/upgrade') return 'POST /account/upgrade';
  if (m === 'POST' && p === '/webhooks/stripe') return 'POST /webhooks/stripe';
  return null;
}

/**
 * @param {string} routeId
 * @returns {{ statusCode: number, headers: object, body: string }}
 */
function stubNotImplemented(routeId) {
  return {
    statusCode: 501,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify({
      error: 'not_implemented',
      route: routeId,
      message: 'FR-208 CDK route wired; handler owned by a sibling FR',
    }),
  };
}

/**
 * @param {object} event
 * @param {string} routeId
 */
async function handleComponentsPieceStub(event, routeId) {
  void event;
  return stubNotImplemented(routeId);
}

module.exports = {
  matchComponentsPieceRoute,
  stubNotImplemented,
  handleComponentsPieceStub,
};
