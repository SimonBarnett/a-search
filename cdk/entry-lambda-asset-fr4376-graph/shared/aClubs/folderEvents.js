'use strict';

/**
 * FR #3968 / #3987: a-clubs new-folder host event schema
 * (gateway -> redqueen via SQS FIFO).
 * Message body: { hostkey, host, createdAt }. MessageGroupId = hostkey.
 * Sent for every new host folder and every new GUID folder.
 */

/**
 * @param {unknown} raw
 * @returns {{ hostkey: string, host: string, createdAt: string }}
 */
function parseFolderEvent(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      const err = new Error('invalid_folder_event_json');
      err.code = 'invalid_folder_event_json';
      throw err;
    }
  }
  if (!obj || typeof obj !== 'object') {
    const err = new Error('invalid_folder_event');
    err.code = 'invalid_folder_event';
    throw err;
  }
  const hostkey = String(obj.hostkey || '').trim();
  const host = String(obj.host || '').trim();
  if (!hostkey || !host) {
    const err = new Error('folder_event_host_required');
    err.code = 'folder_event_host_required';
    throw err;
  }
  const createdAt =
    String(obj.createdAt || '').trim() || new Date().toISOString();
  return { hostkey, host, createdAt };
}

/**
 * @param {{ hostkey: string, host: string, createdAt?: string }} fields
 */
function buildFolderEvent(fields) {
  return parseFolderEvent({
    hostkey: fields.hostkey,
    host: fields.host,
    createdAt: fields.createdAt || new Date().toISOString(),
  });
}

/** FIFO MessageGroupId = hostkey (ordered per host). */
function messageGroupId(ev) {
  return String(ev.hostkey);
}

/**
 * Dedup id per created folder (hostkey or hostkey/guid) so retries do not double-send.
 * @param {{ hostkey: string, createdAt: string, reason?: string }} ev
 */
function messageDeduplicationId(ev) {
  const reason = ev.reason ? String(ev.reason) : 'host';
  return `${ev.hostkey}:${reason}:${ev.createdAt}`.slice(0, 128);
}

module.exports = {
  parseFolderEvent,
  buildFolderEvent,
  messageGroupId,
  messageDeduplicationId,
};
