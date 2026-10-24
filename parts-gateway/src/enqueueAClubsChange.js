'use strict';

/**
 * FR #4833: EventBridge → a-clubs-changes enqueue filter.
 * Object Created keys ending in `/` are noisy; only host/GUID markers are forwarded.
 * widget.json / searches.json keep direct EventBridge→SQS rules (no Lambda hop).
 */

const {
  parseChangeEvent,
  isHostOrGuidMarkerKey,
} = require('../../shared/aClubs/changeEvents');

function defaultSendMessage() {
  // Lazy: unit tests inject sendMessage and must not require the SDK at load.
  const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
  const client = new SQSClient({});
  return (input) => client.send(new SendMessageCommand(input));
}

/**
 * @param {unknown} event
 * @param {{
 *   queueUrl?: string,
 *   sendMessage?: (input: object) => Promise<unknown>,
 * }} [deps]
 * @returns {Promise<{ ok: boolean, enqueued: boolean, skipped?: string, key?: string }>}
 */
async function enqueueAClubsChange(event, deps) {
  const queueUrl =
    (deps && deps.queueUrl) ||
    process.env.A_CLUBS_CHANGES_QUEUE_URL ||
    '';
  if (!String(queueUrl).trim()) {
    throw new Error('A_CLUBS_CHANGES_QUEUE_URL required');
  }

  let parsed;
  try {
    parsed = parseChangeEvent(event);
  } catch (err) {
    return {
      ok: true,
      enqueued: false,
      skipped: String((err && err.code) || (err && err.message) || err),
    };
  }
  if (!parsed) {
    return { ok: true, enqueued: false, skipped: 'excluded' };
  }
  if (parsed.kind !== 'marker' || !isHostOrGuidMarkerKey(parsed.key)) {
    return {
      ok: true,
      enqueued: false,
      skipped: 'not_host_guid_marker',
      key: parsed.key,
    };
  }

  const body = JSON.stringify({
    key: parsed.key,
    kind: 'marker',
    hostkey: parsed.hostkey,
    ...(parsed.guid ? { guid: parsed.guid } : {}),
    ...(parsed.etag ? { etag: parsed.etag } : {}),
  });

  const send =
    deps && typeof deps.sendMessage === 'function'
      ? deps.sendMessage
      : defaultSendMessage();

  await send({
    QueueUrl: queueUrl,
    MessageBody: body,
  });
  return { ok: true, enqueued: true, key: parsed.key };
}

/**
 * Lambda entry (EventBridge target).
 * @param {unknown} event
 */
async function handler(event) {
  return enqueueAClubsChange(event);
}

module.exports = {
  enqueueAClubsChange,
  handler,
};
