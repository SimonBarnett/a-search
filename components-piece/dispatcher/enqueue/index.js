'use strict';

/**
 * EventBridge S3 Object Created -> SQS FIFO enqueue (#1343).
 * Dynamic MessageGroupId requires this Lambda (FIFO target cannot set it from the rule alone).
 */

const {
  classifyS3Key,
  fifoSendParamsFromS3,
  buildQueueMessage,
  messageGroupId,
  messageDeduplicationId,
} = require('./agentQueue');

function createHandler(deps) {
  const send =
    deps && deps.sendMessage
      ? deps.sendMessage
      : async (params) => {
          const {
            SQSClient,
            SendMessageCommand,
          } = require('@aws-sdk/client-sqs');
          const client = deps.sqsClient || new SQSClient({});
          await client.send(
            new SendMessageCommand({
              QueueUrl: process.env.A_SEARCH_WIDGET_AGENT_QUEUE_URL,
              ...params,
            }),
          );
        };

  return async function handler(event) {
    if (event && event.eventType === 'sweep') {
      const widgets = Array.isArray(event.widgets) ? event.widgets : [];
      let sent = 0;
      for (const w of widgets) {
        const body = buildQueueMessage({
          eventType: 'sweep',
          env: w.env || event.env || 'live',
          customerNumber: w.customerNumber,
          widgetGuid: w.widgetGuid,
          host: w.host || null,
          s3Key: null,
          at: event.at || new Date().toISOString(),
        });
        await send({
          MessageBody: JSON.stringify(body),
          MessageGroupId: messageGroupId(body),
          MessageDeduplicationId: messageDeduplicationId({
            ...body,
            day: (event.at || new Date().toISOString()).slice(0, 10),
          }),
        });
        sent += 1;
      }
      return { ok: true, sent, mode: 'sweep' };
    }

    const detail = (event && event.detail) || {};
    const key =
      (detail.object && (detail.object.key || detail.object.Key)) ||
      event.s3Key ||
      '';
    const sequencer =
      (detail.object && detail.object.sequencer) || event.sequencer || '0';
    const params = fifoSendParamsFromS3(decodeURIComponent(key), sequencer);
    if (!params) {
      return { ok: true, skipped: true, key };
    }
    await send(params);
    return { ok: true, sent: 1, key };
  };
}

const handler = createHandler({});

module.exports = { handler, createHandler };