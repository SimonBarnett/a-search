'use strict';

/**
 * FR #3968 / #3987: publish host folder events to SQS FIFO (injectable).
 * Sent for every new host and every new GUID so redqueen can annotate GUIDs
 * under already-annotated hosts without a separate GUID event type.
 */

const {
  buildFolderEvent,
  messageGroupId,
  messageDeduplicationId,
} = require('../../shared/aClubs/folderEvents');

/**
 * @param {{
 *   sendMessage?: Function,
 *   queueUrl?: string,
 *   hostkey: string,
 *   host: string,
 *   createdAt?: string,
 *   reason?: string,
 * }} opts
 * @returns {Promise<{ published: boolean, event?: object, skipped?: string }>}
 */
async function publishFolderEvent(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('publishFolderEvent opts required');
  }
  if (typeof opts.sendMessage !== 'function' || !opts.queueUrl) {
    return { published: false, skipped: 'no_queue' };
  }
  const event = buildFolderEvent(opts);
  const body = `${JSON.stringify(event)}\n`;
  await opts.sendMessage({
    QueueUrl: opts.queueUrl,
    MessageBody: body,
    MessageGroupId: messageGroupId(event),
    MessageDeduplicationId: messageDeduplicationId({
      ...event,
      reason: opts.reason || 'host',
    }),
  });
  return { published: true, event };
}

module.exports = {
  publishFolderEvent,
};
