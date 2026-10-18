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
 * FR #4265: one fan-out record per GUID. A retry returns this searchid and does not send again.
 * @param {string} hostkey
 * @param {string} guid
 */
function searchFanoutKey(hostkey, guid) {
  const host = String(hostkey).replace(/\/+$/, '');
  const id = String(guid).trim().toLowerCase();
  return `${host}/${id}/search-fanout.json`;
}

function isMissingObject(err) {
  const status = err && err.$metadata && err.$metadata.httpStatusCode;
  const code = err && (err.name || err.code);
  return status === 404 || code === 'NotFound' || code === 'NoSuchKey';
}

async function readStoredFanout(getObject, Key) {
  if (typeof getObject !== 'function') return null;
  try {
    const obj = await getObject({ Key });
    let text = '';
    const body = obj && obj.Body;
    if (Buffer.isBuffer(body)) text = body.toString('utf8');
    else if (typeof body === 'string') text = body;
    else if (body && typeof body.transformToString === 'function') {
      text = await body.transformToString();
    } else if (body != null) text = String(body);
    const parsed = JSON.parse(text);
    if (!parsed || !parsed.searchid) return null;
    return parsed;
  } catch (err) {
    if (isMissingObject(err) || err instanceof SyntaxError) return null;
    throw err;
  }
}

let defaultS3;
function defaultAclubsIo() {
  if (defaultS3) return defaultS3;
  const {
    S3Client,
    HeadObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
  } = require('@aws-sdk/client-s3');
  const client = new S3Client({});
  const bucket = process.env.A_CLUBS_BUCKET || 'a-clubs';
  defaultS3 = {
    headObject: (input) =>
      client.send(new HeadObjectCommand({ Bucket: bucket, Key: input.Key })),
    getObject: (input) =>
      client.send(new GetObjectCommand({ Bucket: bucket, Key: input.Key })),
    putObject: (input) =>
      client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: input.Key,
          Body: input.Body,
          ContentType: input.ContentType,
        }),
      ),
  };
  return defaultS3;
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
  if (!opts || typeof opts !== 'object') {
    throw new AgentSearchError('s3_required', 500);
  }
  const io = typeof opts.headObject === 'function' ? opts : { ...opts, ...defaultAclubsIo() };
  if (typeof io.headObject !== 'function') {
    throw new AgentSearchError('s3_required', 500);
  }
  requireAgentAuth(io.event, { env: io.env });

  const body = parseJsonBody(io.event && io.event.body);
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
    await io.headObject({ Key: markerKey });
  } catch (err) {
    if (isMissingObject(err)) {
      throw new AgentSearchError('guid_not_found', 404);
    }
    throw err;
  }

  const fanoutKey = searchFanoutKey(hostkey, guid);
  const prior = await readStoredFanout(io.getObject, fanoutKey);
  if (prior && prior.searchid) {
    return {
      searchid: String(prior.searchid),
      queued: Array.isArray(prior.queued) ? prior.queued : [],
      idempotent: true,
    };
  }

  const searchid = body.searchid
    ? String(body.searchid)
    : (io.newSearchId || newSearchId)();
  const jobEnv = body.sandbox === true ? 'sandbox' : 'live';
  const queued = resolveFanOutTargets(jobEnv, {
    enabled: io.enabled,
    loadRegistry: io.loadRegistry,
  });

  const send =
    io.sendMessage ||
    createSqsSendMessage({ envVars: io.env || process.env });

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
      // Stable per GUID+source so a lost-response retry does not double-enqueue.
      messageDeduplicationId: `${searchid}-${source}`,
    };
    await send(payload);
  }

  if (typeof io.putObject === 'function') {
    await io.putObject({
      Key: fanoutKey,
      Body: Buffer.from(
        `${JSON.stringify({ searchid, queued, at: new Date().toISOString() })}\n`,
        'utf8',
      ),
      ContentType: 'application/json',
    });
  }

  return { searchid, queued, idempotent: false };
}

module.exports = {
  AgentSearchError,
  requireAgentAuth,
  agentKeyMatches,
  handleAgentSearch,
  resolveFanOutTargets,
  isAgentSearchBody,
  newSearchId,
  searchFanoutKey,
  headerGet,
  parseJsonBody,
};
