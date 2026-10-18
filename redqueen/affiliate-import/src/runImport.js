'use strict';

/**
 * FR #4001: daily deterministic affiliate import on redqueen.
 */

const { listPendingPartsFiles, loadAffiliateMeta } = require('./listPending');
const { parseAffiliateFeed } = require('./parseFeed');
const { toStagingRows, importAffiliateInMemory } = require('./upsertImport');
const { pruneRemovedPartsFromLiveJson } = require('./pruneLiveJson');
const { triggerFixingAgent, redactCredentialLine } = require('./triggerAgent');
const { acquireImportLock } = require('./lock');
const { createPartLiveIndex } = require('./partIndex');

/**
 * @param {string} line
 * @param {(s: string) => void} [log]
 */
function logLine(line, log) {
  const safe = redactCredentialLine(line);
  if (typeof log === 'function') log(safe);
  else console.log(safe);
}

/**
 * Process one pending file. Idempotent: failure keeps the file.
 * @returns {Promise<{ ok: boolean, code?: string, importcount?: number, removedcount?: number }>}
 */
async function processOneFile(file, opts) {
  const meta = await loadAffiliateMeta({
    getObject: opts.getAffiliatesObject,
    bucket: opts.affiliatesBucket,
    provider: file.provider,
    affiliateid: file.affiliateid,
  });
  if (!meta.enabled) {
    return { ok: true, code: 'skipped_disabled' };
  }

  let raw;
  try {
    const obj = await opts.getAffiliatesObject({
      Bucket: opts.affiliatesBucket || 'a-affiliates',
      Key: file.key,
    });
    raw = obj.Body != null ? obj.Body : obj.body;
    if (raw && typeof raw.transformToByteArray === 'function') {
      raw = Buffer.from(await raw.transformToByteArray());
    } else if (typeof raw === 'string') {
      raw = Buffer.from(raw, 'utf8');
    }
  } catch (err) {
    return { ok: false, code: 'get_failed', reason: String(err && err.message) };
  }

  let parsed;
  try {
    parsed = parseAffiliateFeed(raw, {
      provider: file.provider,
      affiliateid: file.affiliateid,
      format: meta.format,
      compression: meta.compression,
    });
  } catch (err) {
    return {
      ok: false,
      code: err.code || 'parse_failed',
      reason: String(err && err.message),
    };
  }

  const staging = toStagingRows(parsed);
  let result;
  try {
    result = importAffiliateInMemory({
      parts: opts.parts,
      staging,
      provider: file.provider,
      affiliateid: file.affiliateid,
      maxRemoveRatio: opts.maxRemoveRatio,
      now: opts.now,
    });
    opts.parts.splice(0, opts.parts.length, ...result.parts);
  } catch (err) {
    return {
      ok: false,
      code: err.code || 'import_failed',
      reason: String(err && err.message),
    };
  }

  try {
    await pruneRemovedPartsFromLiveJson({
      removedKeys: result.removedKeys,
      index: opts.index,
      getObject: opts.getClubsObject,
      putObject: opts.putClubsObject,
      touchLastmod: opts.touchLastmod,
    });
  } catch (err) {
    return {
      ok: false,
      code: 'prune_failed',
      reason: String(err && err.message),
    };
  }

  // Success: delete file then update affiliate metadata
  try {
    await opts.deleteAffiliatesObject({
      Bucket: opts.affiliatesBucket || 'a-affiliates',
      Key: file.key,
    });
  } catch (err) {
    return {
      ok: false,
      code: 'delete_failed',
      reason: String(err && err.message),
    };
  }

  if (typeof opts.updateAffiliateMeta === 'function') {
    const nowIso = (opts.now instanceof Date
      ? opts.now
      : new Date()
    ).toISOString();
    await opts.updateAffiliateMeta({
      provider: file.provider,
      affiliateid: file.affiliateid,
      patch: {
        lastimport: nowIso,
        importstatus: 'ok',
        importcount: String(result.inserted + result.updated),
        removedcount: String(result.removed),
        lastmod: nowIso,
      },
    });
  }

  return {
    ok: true,
    importcount: result.inserted + result.updated,
    removedcount: result.removed,
  };
}

/**
 * Daily run. Continues after per-affiliate failures; triggers agent when any fail.
 */
async function runDailyImport(opts) {
  const log = opts.log;
  const lockPath =
    opts.lockPath ||
    require('node:path').join(
      require('node:os').tmpdir(),
      'a-search-affiliate-import.lock',
    );
  const lock = acquireImportLock(lockPath, {
    pid: opts.pid,
    now: opts.nowMs,
    staleMs: opts.staleMs,
  });
  if (!lock.ok) {
    logLine('affiliate-import: lock held; exit', log);
    return { exitCode: 2, code: 'lock_held', processed: 0, failed: [] };
  }

  try {
    const pending = await listPendingPartsFiles({
      listObjectsV2: opts.listAffiliatesObjects,
      bucket: opts.affiliatesBucket,
    });
    if (!pending.length) {
      logLine('affiliate-import: nothing to do', log);
      return { exitCode: 0, code: 'nothing_to_do', processed: 0, failed: [] };
    }

    const parts = opts.parts || [];
    const index = opts.index || createPartLiveIndex();
    const failed = [];
    let processed = 0;

    for (const file of pending) {
      const one = await processOneFile(file, {
        ...opts,
        parts,
        index,
      });
      if (one.ok) {
        processed += 1;
        logLine(
          `affiliate-import: ok ${file.provider}/${file.affiliateid} ${file.key} import=${one.importcount || 0} removed=${one.removedcount || 0}`,
          log,
        );
      } else {
        failed.push({ ...file, ...one });
        logLine(
          `affiliate-import: FAIL ${file.provider}/${file.affiliateid} ${file.key} code=${one.code} reason=${one.reason || ''}`,
          log,
        );
      }
    }

    if (failed.length) {
      for (const f of failed) {
        await triggerFixingAgent({
          provider: f.provider,
          affiliateid: f.affiliateid,
          fileKey: f.key,
          reason: f.reason || f.code || 'import_failed',
          logPath: opts.logPath,
          grokTokensRemaining: opts.grokTokensRemaining,
          startGrok: opts.startGrok,
          startCursor: opts.startCursor,
        });
      }
      return {
        exitCode: 1,
        code: 'partial_failure',
        processed,
        failed,
        parts,
        index,
      };
    }

    return { exitCode: 0, code: 'ok', processed, failed: [], parts, index };
  } finally {
    lock.release();
  }
}

module.exports = {
  runDailyImport,
  processOneFile,
};
