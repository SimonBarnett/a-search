'use strict';

/**
 * #1343 Agentic Searches: S3 key -> eventType + SQS FIFO message helpers.
 * Agent output writes (live.json, context.md, ...) must NOT classify as events.
 */

const TRIGGER_SUFFIXES = Object.freeze({
  '_host.json': 'host_created',
  '/widget.json': 'widget_created',
  '/feedback.json': 'widget_feedback',
});

const NON_TRIGGER_BASENAMES = Object.freeze([
  'live.json',
  'context.md',
  'searches.json',
  'site.md',
  'top10.json',
  'stats.json',
  'last-run.json',
  'in.processing.json',
]);

/**
 * @param {string} s3Key e.g. sandbox/x/42/_host.json
 * @returns {object|null}
 */
function classifyS3Key(s3Key) {
  const key = s3Key == null ? '' : String(s3Key).replace(/\\/g, '/');
  if (!key) return null;
  const base = key.split('/').pop() || '';
  if (NON_TRIGGER_BASENAMES.includes(base)) return null;

  let eventType = null;
  for (const [suffix, type] of Object.entries(TRIGGER_SUFFIXES)) {
    if (key.endsWith(suffix)) {
      eventType = type;
      break;
    }
  }
  if (!eventType) {
    const inReady = key.match(
      /^(live|sandbox)\/x\/([^/]+)\/([^/]+)\/IN\/([^/]+)\.json$/,
    );
    if (!inReady) return null;
    const searchId = inReady[4];
    if (!searchId || searchId.charAt(0) === '.') return null;
    return {
      eventType: 'in_ready',
      env: inReady[1],
      customerNumber: inReady[2],
      widgetGuid: inReady[3],
      host: null,
      s3Key: key,
    };
  }

  const m = key.match(/^(live|sandbox)\/x\/([^/]+)(?:\/([^/]+))?\/[^/]+$/);
  if (!m) return null;
  const env = m[1];
  const customerNumber = m[2];
  let widgetGuid = null;
  if (eventType === 'host_created') {
    if (!key.endsWith('/' + customerNumber + '/_host.json')) return null;
  } else {
    widgetGuid = m[3] || null;
    if (!widgetGuid) return null;
  }
  return {
    eventType,
    env,
    customerNumber,
    widgetGuid,
    host: null,
    s3Key: key,
  };
}

function messageGroupId(parts) {
  const env = parts.env;
  const customerNumber = parts.customerNumber;
  if (parts.eventType === 'host_created' || !parts.widgetGuid) {
    return env + '/' + customerNumber + '/_host';
  }
  return env + '/' + customerNumber + '/' + parts.widgetGuid;
}

function messageDeduplicationId(opts) {
  if (opts.eventType === 'sweep' || opts.eventType === 'tier_changed') {
    const day =
      opts.day ||
      (opts.at ? String(opts.at).slice(0, 10) : new Date().toISOString().slice(0, 10));
    return (
      opts.eventType +
      ':' +
      opts.customerNumber +
      ':' +
      (opts.widgetGuid || '_host') +
      ':' +
      day
    );
  }
  const seq = opts.sequencer != null ? String(opts.sequencer) : '0';
  return opts.eventType + ':' + opts.s3Key + ':' + seq;
}

function buildQueueMessage(opts) {
  const at = opts.at || new Date().toISOString();
  return {
    eventType: opts.eventType,
    env: opts.env,
    customerNumber: String(opts.customerNumber),
    widgetGuid: opts.widgetGuid == null ? null : String(opts.widgetGuid),
    host: opts.host == null ? null : String(opts.host),
    s3Key: opts.s3Key == null ? null : String(opts.s3Key),
    at,
  };
}

function fifoSendParamsFromS3(s3Key, sequencer, extra) {
  const classified = classifyS3Key(s3Key);
  if (!classified) return null;
  const body = buildQueueMessage({
    ...classified,
    ...(extra || {}),
    at: (extra && extra.at) || new Date().toISOString(),
  });
  return {
    MessageBody: JSON.stringify(body),
    MessageGroupId: messageGroupId(classified),
    MessageDeduplicationId: messageDeduplicationId({
      ...classified,
      sequencer: sequencer || '0',
    }),
  };
}

module.exports = {
  TRIGGER_SUFFIXES,
  NON_TRIGGER_BASENAMES,
  classifyS3Key,
  messageGroupId,
  messageDeduplicationId,
  buildQueueMessage,
  fifoSendParamsFromS3,
};