'use strict';

/**
 * Entry HTTP accept handler (FR-005) + fan-out enqueue (FR-006) +
 * performance stub (FR-053b).
 * JWT verify (FR-004) + body validation + registry-backed SQS fan-out (injectable sendMessage).
 * Never trusts a request-body user id.
 */

const crypto = require('node:crypto');
const { verifyAuthorization, AuthError } = require('./auth/jwt');
const { fanOutEnqueue, EnqueueError } = require('./enqueue');
const {
  emptyPerformancePayload,
  resolvePerformanceInput,
  queryParams,
} = require('./performance');
const { aggregateClicksVisits } = require('./performanceClicksVisits');
const {
  reportException: defaultReportException,
} = require('../../shared/intake/reportException');

const JSON_HEADERS = { 'content-type': 'application/json' };
const ENTRY_ROUTE = 'entry/POST /search';
const PERF_ROUTE = 'entry/account/performance';

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function newSearchId() {
  return `srch_${crypto.randomBytes(10).toString('hex')}`;
}

function headerGet(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === want) return v;
  }
  return undefined;
}

function parseBody(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {object} event
 * @returns {{ method: string, path: string }}
 */
function resolveHttp(event) {
  const method = String(
    (event &&
      event.requestContext &&
      event.requestContext.http &&
      event.requestContext.http.method) ||
      (event && event.httpMethod) ||
      'POST',
  ).toUpperCase();
  let path = String(
    (event && event.rawPath) ||
      (event &&
        event.requestContext &&
        event.requestContext.http &&
        event.requestContext.http.path) ||
      (event && event.path) ||
      '/search',
  );
  // strip stage prefix like /prod
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  const q = path.indexOf('?');
  if (q >= 0) path = path.slice(0, q);
  return { method, path };
}

function isPerformanceRoute(method, path) {
  if (path !== '/account/performance') return false;
  return method === 'GET' || method === 'POST';
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, value: object } | { ok: false, fields: string[] }}
 */
function validateSearchBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, fields: ['body'] };
  }
  const fields = [];
  const hasQ = typeof body.q === 'string' && body.q.trim() !== '';
  const hasTerms =
    Array.isArray(body.searchterms) &&
    body.searchterms.some((t) => typeof t === 'string' && t.trim() !== '');
  if (!hasQ && !hasTerms) fields.push('q', 'searchterms');

  if (
    body.catalogId === undefined ||
    body.catalogId === null ||
    body.catalogId === ''
  ) {
    fields.push('catalogId');
  }
  if (typeof body.category !== 'string' || body.category.trim() === '') {
    fields.push('category');
  }
  if (typeof body.subcategory !== 'string' || body.subcategory.trim() === '') {
    fields.push('subcategory');
  }
  if (body.sources !== undefined) {
    if (
      !Array.isArray(body.sources) ||
      body.sources.some((s) => typeof s !== 'string')
    ) {
      fields.push('sources');
    }
  }
  if (body.sandbox !== undefined && typeof body.sandbox !== 'boolean') {
    fields.push('sandbox');
  }
  if (fields.length) return { ok: false, fields: [...new Set(fields)] };
  return {
    ok: true,
    value: {
      q: hasQ ? body.q.trim() : undefined,
      searchterms: hasTerms ? body.searchterms : undefined,
      catalogId: body.catalogId,
      category: body.category.trim(),
      subcategory: body.subcategory.trim(),
      sources: body.sources,
      sandbox: body.sandbox === true,
    },
  };
}

/**
 * Default enqueue: FR-006 fan-out with FR-032 SQS SendMessage default.
 * @param {object} args
 * @returns {Promise<string[]>}
 */
async function defaultEnqueue(args) {
  return fanOutEnqueue(args);
}

/**
 * @param {object} event - API Gateway-style event
 * @param {object} [_context]
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   verifyAuthorization?: Function,
 *   enqueue?: (args: object) => Promise<string[]>,
 *   newSearchId?: () => string,
 *   sendMessage?: (payload: object) => Promise<void>,
 *   reportException?: Function,
 * }} [deps]
 */
async function handler(event, _context, deps = {}) {
  const report = deps.reportException || defaultReportException;
  const { method, path } = resolveHttp(event || {});
  const route = isPerformanceRoute(method, path) ? PERF_ROUTE : ENTRY_ROUTE;
  try {
    if (isPerformanceRoute(method, path)) {
      return await handlePerformance(event, deps);
    }
    return await handleSearch(event, deps);
  } catch (err) {
    // Client AuthError / EnqueueError are returned as 401/400 inside handlers.
    // Unexpected fatals file a-search intake once (FR-048c).
    try {
      await report({
        err,
        route,
        source: 'entry',
        fetch: deps.fetch,
      });
    } catch {
      // Intake failure must not mask the original error response.
    }
    return jsonResponse(500, {
      accepted: false,
      ok: false,
      error: 'internal_error',
    });
  }
}

/**
 * FR-053b performance stub.
 * @param {object} event
 * @param {object} deps
 */
async function handlePerformance(event, deps = {}) {
  const env = deps.env || process.env;
  const verify = deps.verifyAuthorization || verifyAuthorization;

  const authHeader =
    headerGet(event && event.headers, 'authorization') ||
    headerGet(event && event.headers, 'Authorization');

  let userId;
  try {
    const auth = await verify(authHeader, { env, body: undefined });
    userId = auth.userId;
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse(401, { ok: false, error: err.code });
    }
    return jsonResponse(401, { ok: false, error: 'unauthorized' });
  }

  const query = queryParams(event);
  const rawBody = event && event.body;
  const parsed = parseBody(rawBody);
  if (parsed === null) {
    return jsonResponse(400, {
      ok: false,
      error: 'invalid_json',
    });
  }

  // Body / query userId is never authority; if present and differs → 401
  const bodyUser =
    parsed.userId !== undefined && parsed.userId !== null
      ? parsed.userId
      : query.userId;
  if (
    bodyUser !== undefined &&
    bodyUser !== null &&
    String(bodyUser) !== String(userId)
  ) {
    return jsonResponse(401, { ok: false, error: 'user_id_mismatch' });
  }

  const resolved = resolvePerformanceInput(query, parsed);
  if (!resolved.ok) {
    return jsonResponse(400, { ok: false, error: resolved.error });
  }

  const range = resolved.value;
  const payload = emptyPerformancePayload(userId, range);

  // FR-053c: fill clicks/visits from injectable read model (sales stay stub).
  const aggregate =
    typeof deps.aggregateClicksVisits === 'function'
      ? deps.aggregateClicksVisits
      : aggregateClicksVisits;
  const stats = await aggregate({
    userId,
    env: range.env,
    from: range.from,
    to: range.to,
    events: deps.clickVisitEvents,
    listEvents: deps.listClickVisitEvents,
  });
  payload.clicks = Number(stats && stats.clicks) || 0;
  payload.visits = Number(stats && stats.visits) || 0;
  payload.uniqueVisitors = Number(stats && stats.uniqueVisitors) || 0;

  return jsonResponse(200, payload);
}

/**
 * @param {object} event
 * @param {object} deps
 */
async function handleSearch(event, deps = {}) {
  const env = deps.env || process.env;
  const verify = deps.verifyAuthorization || verifyAuthorization;
  const makeId = deps.newSearchId || newSearchId;
  const enqueue =
    deps.enqueue ||
    ((args) =>
      defaultEnqueue({
        ...args,
        sendMessage: deps.sendMessage,
      }));

  const authHeader =
    headerGet(event && event.headers, 'authorization') ||
    headerGet(event && event.headers, 'Authorization');

  let userId;
  try {
    const auth = await verify(authHeader, { env, body: undefined });
    userId = auth.userId;
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse(401, { accepted: false, error: err.code });
    }
    return jsonResponse(401, { accepted: false, error: 'unauthorized' });
  }

  const rawBody = event && event.body;
  const parsed = parseBody(rawBody);
  if (parsed === null) {
    return jsonResponse(400, {
      accepted: false,
      error: 'invalid_json',
      fields: ['body'],
    });
  }

  // Body userId is never authority; if present and differs → 401
  if (
    parsed.userId !== undefined &&
    parsed.userId !== null &&
    String(parsed.userId) !== String(userId)
  ) {
    return jsonResponse(401, { accepted: false, error: 'unauthorized' });
  }

  const validated = validateSearchBody(parsed);
  if (!validated.ok) {
    return jsonResponse(400, {
      accepted: false,
      error: 'missing_required_field',
      fields: validated.fields,
    });
  }

  const jobEnv = validated.value.sandbox ? 'sandbox' : 'live';
  const searchId = makeId();
  let enqueued;
  try {
    enqueued = await enqueue({
      searchId,
      userId,
      env: jobEnv,
      body: validated.value,
    });
  } catch (err) {
    if (err instanceof EnqueueError) {
      return jsonResponse(400, {
        accepted: false,
        error: err.code,
        fields: err.fields,
      });
    }
    throw err;
  }

  return jsonResponse(200, {
    searchId,
    accepted: true,
    userId,
    env: jobEnv,
    enqueued: Array.isArray(enqueued) ? enqueued : [],
  });
}

module.exports = {
  handler,
  handlePerformance,
  handleSearch,
  validateSearchBody,
  newSearchId,
  defaultEnqueue,
  resolveHttp,
  isPerformanceRoute,
};
