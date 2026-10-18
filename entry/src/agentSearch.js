'use strict';

/**
 * FR #4030: agent /search fan-out --- hostkey+guid+queries to each live provider SQS + SQL SQS.
 * Auth: x-agent-api-key (or Authorization: Bearer agent:<key>) matching A_SEARCH_AGENT_API_KEY.
 * No CORS *. Returns 202 {searchid, queued}. Writes nothing to MSSQL.
 */

const crypto = require('node:crypto');
const { loadRegistry, enabled: registryEnabled } = require('../../providers/loadRegistry');
const { isDbBackedSource } = require('./dbBackedQueue');
const { createSqsSendMessage } = require('./sqsSend');

class AgentSearchError extends Error {
  /**
   * @param {string} code
   * @param {number} [statusCode]
   */
  constructor(code, statusCode) {
    super(code);
    this.name = 'AgentSearchError';
    this.code = code;
    this.statusCode = statusCode || 400;
  }
}

/**
 * @param {unknown} headers
 * @param {string} name
 * @returns {string}
 */
function headerGet(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const want = String(name).toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === want && v != null) return String(v);
  }
  return '';
}

/**
 * Constant-time compare of agent API keys (never log either value).
 * @param {string} provided
 * @param {string} expected
 * @returns {boolean}
 */
function agentKeyMatches(provided, expected) {
  const a = Buffer.from(String(provided || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/**
 * @param {object} event
 * @param {{ env?: NodeJS.ProcessEnv }} [deps]
 */
function requireAgentAuth(event, deps = {}) {
  const env = deps.env || process.env;
  const expected =
    env.A_SEARCH_AGENT_API_KEY != null ? String(env.A_SEARCH_AGENT_API_KEY) : '';
  if (!expected) {
    throw new AgentSearchError('agent_key_not_configured', 401);
  }
  const headers = (event && event.headers) || {};
  let provided = headerGet(headers, 'x-agent-api-key');
  if (!provided) {
    const auth = headerGet(headers, 'authorization');
    const m = /^Bearer\s+agent:(.+)$/i.exec(auth);
    if (m) provided = m[1];
  }
  if (!agentKeyMatches(provided, expected)) {
    throw new AgentSearchError('unauthorized', 401);
  }
}

/**
 * @returns {string}
 */
function newSearchId() {
  return `srch_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * @param {unknown} raw
 */
function parseJsonBody(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  try {
    return JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw));
  } catch {
    return null;
  }
}

/**
 * True when body looks like the FR #4030 agent search shape (not legacy JWT search).
 * @param {unknown} body
 * @returns {boolean}
 */
function isAgentSearchBody(body) {
  if (!body || typeof body !== 'object') return false;
  const hostkey = body.hostkey || body.host;
  const guid = body.guid || body.widgetGuid;
  return (
    hostkey != null &&
    String(hostkey).trim() !== '' &&
    guid != null &&
    String(guid).trim() !== '' &&
    Array.isArray(body.queries)
  );
}

/**
 * Live (non-local) provider ids enabled for env, plus always "sql".
 * @param {'live'|'sandbox'} envName
 * @param {{ enabled?: Function, loadRegistry?: Function }} [deps]
 * @returns {string[]}
 */
function resolveFanOutTargets(envName, deps = {}) {
  const enabledFn = deps.enabled || registryEnabled;
  const load = deps.loadRegistry || loadRegistry;
  const { sources } = load();
  const byId = new Map((sources || []).map((s) => [s.id, s]));
  const live = [];
  for (const id of enabledFn(envName)) {
    const ent = byId.get(id);
    if (isDbBackedSource(ent)) continue;
    live.push(id);
  }
  return [...live, 'sql'];
}

/**
 * @param {{
 *   event: object,
 *   headObject: Function,
 *   sendMessage?: Function,
 *   env?: NodeJS.ProcessEnv,
 *   newSearchId?: () => string,
 *   enabled?: Function,
 *   loadRegistry?: Function,
 * }} opts
 */
async function handleAgentSearch(opts) {
  if (!opts || typeof opts.headObject !== 'function') {
    throw new AgentSearchError('s3_required', 500);
  }
  requireAgentAuth(opts.event, { env: opts.env });

  const body = parseJsonBody(opts.event && opts.event.body);
  if (!body || typeof body !== 'object') {
    throw new AgentSearchError('invalid_json', 400);
  }

  const hostkey = String(body.hostkey || body.host || '')
    .trim()
    .toLowerCase();
  const guid = String(body.guid || body.widgetGuid || '').trim();
  const queries = body.queries;
  const exclude = Array.isArray(body.exclude) ? body.exclude : [];
  if (!hostkey) throw new AgentSearchError('hostkey_required', 400);
  if (!guid) throw new AgentSearchError('guid_required', 400);
  if (!Array.isArray(queries)) throw new AgentSearchError('queries_required', 400);

  const markerKey = `${hostkey}/${guid}/`;
  try {
    await opts.headObject({ Key: markerKey });
  } catch (err) {
    const status = err && err.$metadata && err.$metadata.httpStatusCode;
    const code = err && (err.name || err.code);
    if (status === 404 || code === 'NotFound' || code === 'NoSuchKey') {
      throw new AgentSearchError('guid_not_found', 404);
    }
    throw err;
  }

  const searchid = (opts.newSearchId || newSearchId)();
  const jobEnv = body.sandbox === true ? 'sandbox' : 'live';
  const queued = resolveFanOutTargets(jobEnv, {
    enabled: opts.enabled,
    loadRegistry: opts.loadRegistry,
  });

  const send =
    opts.sendMessage ||
    createSqsSendMessage({ envVars: opts.env || process.env });

  for (const source of queued) {
    const payload = {
      searchid,
      searchId: searchid,
      source,
      hostkey,
      host: hostkey,
      guid,
      widgetGuid: guid,
      queries,
      exclude,
      env: jobEnv,
      sandbox: jobEnv === 'sandbox',
      // FIFO single-flight group per provider (FR #4030).
      messageGroupId: source === 'sql' ? 'sql' : source,
    };
    await send(payload);
  }

  return { searchid, queued };
}

module.exports = {
  AgentSearchError,
  requireAgentAuth,
  agentKeyMatches,
  handleAgentSearch,
  resolveFanOutTargets,
  isAgentSearchBody,
  newSearchId,
  headerGet,
  parseJsonBody,
};
