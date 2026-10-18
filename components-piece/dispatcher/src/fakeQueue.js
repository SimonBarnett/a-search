'use strict';

/**
 * In-memory FIFO-ish queue for #1343 dispatcher tests.
 * One in-flight message per MessageGroupId (FIFO grouping).
 */

function createFakeFifoQueue(opts) {
  const maxReceiveCount = (opts && opts.maxReceiveCount) || 5;
  /** @type {Array<object>} */
  const pending = [];
  /** @type {Map<string, object>} */
  const inFlight = new Map();
  /** @type {Array<object>} */
  const dlq = [];
  let seq = 0;

  function send(params) {
    const groupId = params.MessageGroupId;
    const dedup = params.MessageDeduplicationId;
    if (pending.some((m) => m.MessageDeduplicationId === dedup) ||
        [...inFlight.values()].some((m) => m.MessageDeduplicationId === dedup)) {
      return { deduped: true };
    }
    const msg = {
      MessageId: 'm-' + (++seq),
      MessageBody: params.MessageBody,
      MessageGroupId: groupId,
      MessageDeduplicationId: dedup,
      receiveCount: 0,
      ReceiptHandle: null,
    };
    pending.push(msg);
    return { MessageId: msg.MessageId };
  }

  function receive(maxMessages) {
    const n = maxMessages || 1;
    const out = [];
    for (const msg of pending.slice()) {
      if (out.length >= n) break;
      if (inFlight.has(msg.MessageGroupId)) continue;
      pending.splice(pending.indexOf(msg), 1);
      msg.receiveCount += 1;
      msg.ReceiptHandle = 'rh-' + msg.MessageId + '-' + msg.receiveCount;
      inFlight.set(msg.MessageGroupId, msg);
      out.push({ ...msg });
    }
    return out;
  }

  function deleteMessage(receiptHandle) {
    for (const [gid, msg] of inFlight.entries()) {
      if (msg.ReceiptHandle === receiptHandle) {
        inFlight.delete(gid);
        return true;
      }
    }
    return false;
  }

  function failMessage(receiptHandle) {
    for (const [gid, msg] of inFlight.entries()) {
      if (msg.ReceiptHandle === receiptHandle) {
        inFlight.delete(gid);
        if (msg.receiveCount >= maxReceiveCount) {
          dlq.push(msg);
        } else {
          pending.push(msg);
        }
        return true;
      }
    }
    return false;
  }

  return {
    send,
    receive,
    deleteMessage,
    failMessage,
    pending: () => pending.slice(),
    inFlight: () => new Map(inFlight),
    dlq: () => dlq.slice(),
    maxReceiveCount,
  };
}

module.exports = { createFakeFifoQueue };