'use strict';

/**
 * FR #4196: long-poll drain of the affiliate-import SQS queue on the drain host.
 * For each message, import listed files oldest-first (same processOneFile path).
 */

const { processOneFile } = require('./runImport');
const { createImportLogStore } = require('./importLog');
const { runFixAgent } = require('./fixAgent');
const { redactCredentialLine } = require('./triggerAgent');

/**
 * @param {string|object} body
 * @returns {{ kind?: string, runId?: string, files: object[] }}
 */
function parseImportMessageBody(body) {
  let raw = body;
  if (typeof body === 'string') {
    try {
      raw = JSON.parse(body);
    } catch {
      return { files: [] };
    }
  }
  if (!raw || typeof raw !== 'object') return { files: [] };
  const files = Array.isArray(raw.files) ? raw.files : [];
  return {
    kind: raw.kind,
    runId: raw.runId,
    at: raw.at,
    files,
  };
}

/**
 * Sort files oldest dated key first.
 * @param {object[]} files
 */
function sortFilesOldestFirst(files) {
  return [...files].sort((a, b) => {
    const da = String(a.key || '').match(/(\d{4}-\d{2}-\d{2})/) || [];
    const db = String(b.key || '').match(/(\d{4}-\d{2}-\d{2})/) || [];
    if (da[1] && db[1] && da[1] !== db[1]) return da[1] < db[1] ? -1 : 1;
    return String(a.key).localeCompare(String(b.key));
  });
}

/**
 * @param {{
 *   receiveMessage: Function,
 *   deleteMessage: Function,
 *   queueUrl: string,
 *   maxMessages?: number,
 *   waitTimeSeconds?: number,
 *   importLog?: ReturnType<typeof createImportLogStore>,
 *   headObject?: Function,
 *   startFixAgent?: boolean,
 *   fixAgentOpts?: object,
 *   log?: (s: string) => void,
 * } & Parameters<typeof processOneFile>[1]} opts
 */
async function drainImportOnce(opts) {
  const log = (line) => {
    const safe = redactCredentialLine(line);
    if (typeof opts.log === 'function') opts.log(safe);
  };
  const QueueUrl = opts.queueUrl;
  const resp = await opts.receiveMessage({
    QueueUrl,
    MaxNumberOfMessages: opts.maxMessages || 5,
    WaitTimeSeconds: opts.waitTimeSeconds == null ? 5 : opts.waitTimeSeconds,
    VisibilityTimeout: 120,
  });
  const messages = (resp && resp.Messages) || [];
  const importLog = opts.importLog || createImportLogStore();
  const actions = [];
  let processed = 0;
  const failed = [];

  for (const msg of messages) {
    const parsed = parseImportMessageBody(msg.Body);
    if (parsed.kind && parsed.kind !== 'affiliate-import') {
      actions.push({ messageId: msg.MessageId, action: 'ignored_kind' });
      await opts.deleteMessage({
        QueueUrl,
        ReceiptHandle: msg.ReceiptHandle,
      });
      continue;
    }
    const files = sortFilesOldestFirst(parsed.files || []);
    for (const file of files) {
      let etag = file.etag || '';
      if (!etag && typeof opts.headObject === 'function') {
        try {
          const h = await opts.headObject({
            Bucket: opts.affiliatesBucket || 'a-affiliates',
            Key: file.key,
          });
          etag = String(h.ETag || h.etag || '').replace(/"/g, '');
        } catch {
          // missing object -> processOneFile will treat as gone/ok
        }
      }
      if (etag && importLog.has(file.key, etag)) {
        log(`drain-import: noop already imported ${file.key}`);
        processed += 1;
        continue;
      }
      // File already gone after a prior commit -> ok no-op
      if (typeof opts.getAffiliatesObject === 'function') {
        try {
          await opts.getAffiliatesObject({
            Bucket: opts.affiliatesBucket || 'a-affiliates',
            Key: file.key,
          });
        } catch (err) {
          const name = err && (err.name || err.code);
          if (name === 'NoSuchKey' || name === 'NotFound') {
            importLog.record({
              key: file.key,
              etag: etag || 'gone',
              provider: file.provider,
              affiliateid: file.affiliateid,
              status: 'ok',
            });
            processed += 1;
            continue;
          }
        }
      }

      const one = await processOneFile(
        {
          provider: file.provider,
          affiliateid: file.affiliateid,
          key: file.key,
          etag,
        },
        { ...opts, importLog },
      );
      if (one.ok) {
        processed += 1;
        if (etag || one.etag) {
          importLog.record({
            key: file.key,
            etag: etag || one.etag || 'ok',
            provider: file.provider,
            affiliateid: file.affiliateid,
            status: 'ok',
          });
        }
      } else {
        failed.push({ ...file, ...one, etag });
        if (opts.startFixAgent !== false) {
          await runFixAgent({
            provider: file.provider,
            affiliateid: file.affiliateid,
            fileKey: file.key,
            etag,
            reason: one.reason || one.code || 'import_failed',
            lastImportLog: one,
            grokTokensRemaining: opts.grokTokensRemaining,
            startGrok: opts.startGrok,
            startCursor: opts.startCursor,
            reimport: async () =>
              processOneFile(
                {
                  provider: file.provider,
                  affiliateid: file.affiliateid,
                  key: file.key,
                  etag,
                },
                { ...opts, importLog },
              ),
            updateMarker: opts.updateAffiliateMeta
              ? async (patch) =>
                  opts.updateAffiliateMeta({
                    provider: file.provider,
                    affiliateid: file.affiliateid,
                    patch,
                  })
              : undefined,
            writeSkills: opts.writeSkills,
            fileBug: opts.fileBug,
            notifySimon: opts.notifySimon,
            log: opts.log,
            ...(opts.fixAgentOpts || {}),
          });
        }
      }
    }
    await opts.deleteMessage({
      QueueUrl,
      ReceiptHandle: msg.ReceiptHandle,
    });
    actions.push({
      messageId: msg.MessageId,
      action: 'processed',
      files: files.length,
    });
  }

  return { processed, failed, actions, importLog };
}

module.exports = {
  drainImportOnce,
  parseImportMessageBody,
  sortFilesOldestFirst,
};
