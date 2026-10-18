'use strict';

/**
 * FR #4196: after a download run, enqueue one import SQS message listing files
 * written, then optionally fire the drain wake webhook (outbound only).
 * Never put secrets or feed URLs in the message body.
 */

const crypto = require('node:crypto');

/**
 * @param {{ provider: string, affiliateid?: string, affiliateId?: string, key: string }[]} files
 * @returns {{ provider: string, affiliateid: string, key: string }[]}
 */
function normalizeImportFiles(files) {
  const out = [];
  const seen = new Set();
  for (const f of files || []) {
    if (!f || !f.key) continue;
    const provider = String(f.provider || '')
      .trim()
      .toLowerCase();
    const affiliateid = String(
      f.affiliateid != null ? f.affiliateid : f.affiliateId || '',
    ).trim();
    const key = String(f.key).trim();
    if (!provider || !affiliateid || !key) continue;
    const id = `${provider}|${affiliateid}|${key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ provider, affiliateid, key });
  }
  out.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  return out;
}

/**
 * Build the SQS body for an import drain.
 * @param {{
 *   files: object[],
 *   runId?: string,
 *   at?: string|Date,
 * }} opts
 */
function buildImportMessage(opts) {
  const files = normalizeImportFiles(opts.files || []);
  const at =
    opts.at instanceof Date
      ? opts.at.toISOString()
      : opts.at
        ? String(opts.at)
        : new Date().toISOString();
  const runId =
    opts.runId ||
    crypto.createHash('sha1').update(`${at}:${files.map((f) => f.key).join(',')}`).digest('hex').slice(0, 16);
  return {
    kind: 'affiliate-import',
    runId,
    at,
    files,
  };
}

/**
 * Send one import message when files were written. Empty list -> no send.
 * @param {{
 *   files: object[],
 *   runId?: string,
 *   at?: string|Date,
 *   queueUrl?: string,
 *   sendMessage?: (input: object) => Promise<unknown>,
 *   notifyUrl?: string,
 *   fetchImpl?: typeof fetch,
 *   log?: (s: string) => void,
 * }} opts
 * @returns {Promise<{ sent: boolean, skipped?: string, message?: object, notified?: boolean }>}
 */
async function enqueueImportAfterDownload(opts) {
  const files = normalizeImportFiles(opts.files || []);
  if (!files.length) {
    return { sent: false, skipped: 'empty' };
  }
  const message = buildImportMessage({
    files,
    runId: opts.runId,
    at: opts.at,
  });
  const queueUrl = opts.queueUrl || process.env.A_SEARCH_AFFILIATE_IMPORT_QUEUE_URL;
  if (!queueUrl) {
    return { sent: false, skipped: 'no_queue_url', message };
  }
  if (typeof opts.sendMessage !== 'function') {
    return { sent: false, skipped: 'no_sendMessage', message };
  }
  await opts.sendMessage({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(message),
    MessageGroupId: message.kind,
    MessageDeduplicationId: message.runId,
  });
  let notified = false;
  const notifyUrl =
    opts.notifyUrl || process.env.A_SEARCH_AFFILIATE_IMPORT_NOTIFY_URL;
  if (notifyUrl) {
    const fetchImpl = opts.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl === 'function') {
      try {
        await fetchImpl(notifyUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: 'affiliate-import-wake',
            runId: message.runId,
            at: message.at,
            fileCount: files.length,
          }),
        });
        notified = true;
      } catch (err) {
        if (typeof opts.log === 'function') {
          opts.log(
            `affiliate-import enqueue: notify failed (${err && err.message})`,
          );
        }
      }
    }
  }
  return { sent: true, message, notified };
}

module.exports = {
  normalizeImportFiles,
  buildImportMessage,
  enqueueImportAfterDownload,
};
