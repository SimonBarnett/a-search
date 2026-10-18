'use strict';

/**
 * amazon SQS Lambda entry (FR-038 / FR #4038).
 * On HTTP 429: ChangeMessageVisibility then rethrow (never fail straight to DLQ).
 */

const {
  reportException: defaultReportException,
} = require('../../../../shared/intake/reportException');
const { handleSqsWith429 } = require('../../../../shared/search/handleSqsWith429');

const ROUTE = 'providers/live/amazon/handler';

async function handler(event, deps) {
  const d = deps || {};
  return handleSqsWith429({
    event,
    run: d.run || require('./worker').run,
    deps: d,
    changeMessageVisibility: d.changeMessageVisibility,
    reportException: d.reportException || defaultReportException,
    route: ROUTE,
    source: 'amazon',
  });
}

module.exports = { handler };
