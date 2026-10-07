'use strict';

/**
 * Fan-out enqueue (FR-006): one SQS SendMessage per enabled registry source.
 * body.sources intersects enabled(env); cannot turn on a disabled id.
 */

const { enabled: registryEnabled } = require('../../providers/loadRegistry');
const { queueName } = require('../../providers/queueName');

class EnqueueError extends Error {
  /**
   * @param {'sources_not_enabled'} code
   * @param {string} [message]
   * @param {string[]} [fields]
   */
  constructor(code, message, fields) {
    super(message || code);
    this.name = 'EnqueueError';
    this.code = code;
    this.fields = fields || [];
  }
}

/**
 * @param {{
 *   env: 'live'|'sandbox',
 *   sources?: string[],
 *   enabled?: (env: 'live'|'sandbox') => string[],
 * }} opts
 * @returns {string[]}
 */
function resolveEnqueueTargets(opts) {
  const enabledFn = opts.enabled || registryEnabled;
  const on = enabledFn(opts.env);
  if (!opts.sources || opts.sources.length === 0) {
    return [...on];
  }
  const onSet = new Set(on);
  return opts.sources.filter((id) => onSet.has(id));
}

/**
 * Build the offline-worker SQS payload for one source.
 */
function buildPayload({ searchId, userId, env, body, source }) {
  return {
    searchId,
    userId,
    env,
    catalogId: body.catalogId,
    category: body.category,
    subcategory: body.subcategory,
    q: body.q,
    searchterms: body.searchterms,
    source,
    sandbox: env === 'sandbox',
    // FR-007: queue name includes env so live/sandbox never share a queue
    queueName: queueName(source, env),
  };
}

/**
 * @param {{
 *   searchId: string,
 *   userId: string,
 *   env: 'live'|'sandbox',
 *   body: object,
 *   sendMessage?: (payload: object) => Promise<void>,
 *   enabled?: (env: 'live'|'sandbox') => string[],
 * }} args
 * @returns {Promise<string[]>} enqueued source ids
 */
async function fanOutEnqueue(args) {
  const {
    searchId,
    userId,
    env,
    body,
    sendMessage = async () => {},
    enabled: enabledFn,
  } = args;

  const requested = body && Array.isArray(body.sources) ? body.sources : undefined;
  const targets = resolveEnqueueTargets({
    env,
    sources: requested,
    enabled: enabledFn,
  });

  if (requested && requested.length > 0 && targets.length === 0) {
    throw new EnqueueError(
      'sources_not_enabled',
      'requested sources are not enabled for this env',
      ['sources'],
    );
  }

  const enqueued = [];
  for (const source of targets) {
    const payload = buildPayload({ searchId, userId, env, body, source });
    await sendMessage(payload);
    enqueued.push(source);
  }
  return enqueued;
}

module.exports = {
  fanOutEnqueue,
  EnqueueError,
  resolveEnqueueTargets,
  buildPayload,
};
