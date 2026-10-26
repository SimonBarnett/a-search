'use strict';

/**
 * FR #4918: deterministic hasresults monitor (redqueen).
 * Selects GUID markers with hasresults=1, runs one agent per GUID (lock),
 * and clears hasresults=0 only after a successful agent exit / live.json write.
 * Selection never uses an LLM.
 */

const fs = require('node:fs');
const path = require('node:path');
const { classifyMarkerKey } = require('./staleSweep');
const { clearHasResults } = require('../../shared/widgets/hostFolderMeta');
const { runHasresultsAgentWork } = require('../../shared/widgets/promoteInToLive');
const {
  recheckIncompleteHasResults,
} = require('../../shared/search/recheckHasResults');
const { acquireImportLock } = require('../affiliate-import/src/lock');
const { triggerFixingAgent } = require('../affiliate-import/src/triggerAgent');
const { isExcludedKey, parseChangeEvent } = require('../../shared/aClubs/changeEvents');

const DEFAULT_MAX_RETRIES = 5;

/**
 * @param {Record<string, unknown>|undefined} md
 * @returns {boolean}
 */
function hasResultsReady(md) {
  return String((md && md.hasresults) || '') === '1';
}

/**
 * Brief handed to Grok/Cursor when launching an AI agent in the GUID cwd.
 * @param {{ host: string, guid: string, cwd: string }} opts
 */
function buildHasresultsAgentBrief(opts) {
  return {
    kind: 'hasresults-in-to-live',
    fr: '#4918',
    host: opts.host,
    guid: opts.guid,
    cwdHint: opts.cwd,
    rules: [
      'Read AGENTS.md / SKILL.md in this GUID cwd when present',
      'Convert IN/*.json into live.json with the page-brief filter',
      'Set enabled=1 on the GUID marker (first successful live write)',
      'Delete only the IN files this run processed; leave mid-run arrivals',
      'Do not write hasresults (the monitor clears it after exit 0)',
      'Never print secrets; SELECT-only against MSSQL if needed',
      'Code fixes go through a PR on SimonBarnett/a-search',
    ],
  };
}

/**
 * List GUID markers with hasresults=1.
 * @param {object} opts
 * @returns {Promise<Array<{ key: string, hostkey: string, guid: string, host?: string, metadata: object }>>}
 */
async function listHasresultsMarkers(opts) {
  if (!opts || typeof opts.listObjectsV2 !== 'function') return [];
  const headObject = opts.headObject;
  /** @type {Array<{ key: string, hostkey: string, guid: string, host?: string, metadata: object }>} */
  const found = [];
  let ContinuationToken;
  do {
    const resp = await opts.listObjectsV2({ ContinuationToken });
    const contents = (resp && resp.Contents) || [];
    for (let i = 0; i < contents.length; i += 1) {
      const item = contents[i];
      const classified = classifyMarkerKey(item && item.Key);
      if (!classified || !classified.guid) continue;
      let metadata = {};
      let host;
      if (typeof headObject === 'function') {
        try {
          const head = await headObject({ Key: classified.key });
          metadata = (head && (head.Metadata || head.metadata)) || {};
          if (metadata.host) host = String(metadata.host);
        } catch (err) {
          const status = err && err.$metadata && err.$metadata.httpStatusCode;
          const code = err && (err.name || err.code);
          if (status === 404 || code === 'NotFound' || code === 'NoSuchKey') continue;
          throw err;
        }
      }
      if (!hasResultsReady(metadata)) continue;
      const row = {
        key: classified.key,
        hostkey: classified.hostkey,
        guid: classified.guid,
        metadata,
      };
      if (host) row.host = host;
      found.push(row);
    }
    ContinuationToken = resp && resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (ContinuationToken);

  found.sort((a, b) => {
    if (a.hostkey !== b.hostkey) return a.hostkey < b.hostkey ? -1 : 1;
    return a.guid < b.guid ? -1 : a.guid > b.guid ? 1 : 0;
  });
  return found;
}

/**
 * Default agent runner: deterministic promote + delete IN (injectable for tests).
 * Optionally also starts Grok/Cursor with cwdHint when startGrok/startCursor set.
 * @param {object} opts
 */
async function defaultRunAgent(opts) {
  const work =
    typeof opts.runAgentWork === 'function'
      ? opts.runAgentWork
      : runHasresultsAgentWork;
  const result = await work({
    host: opts.host,
    guid: opts.guid,
    listObjectsV2: opts.listObjectsV2,
    getObject: opts.getObject,
    putObject: opts.putObject,
    deleteObject: opts.deleteObject,
    getObjectAnnotation: opts.getObjectAnnotation,
    headObject: opts.headObject,
    copyObject: opts.copyObject,
    getObjectTagging: opts.getObjectTagging,
    putObjectTagging: opts.putObjectTagging,
    now: opts.now,
    bucket: opts.bucket,
    failBeforeDelete: opts.failBeforeDelete,
  });

  if (typeof opts.startGrok === 'function' || typeof opts.startCursor === 'function') {
    await triggerFixingAgent({
      provider: 'hasresults-monitor',
      affiliateid: opts.guid,
      fileKey: opts.key,
      reason: 'hasresults=1 GUID ready for IN to live.json',
      cwdHint: opts.cwd,
      grokTokensRemaining: opts.grokTokensRemaining,
      startGrok: opts.startGrok,
      startCursor: opts.startCursor,
      fr: '#4918',
      rulesExtra: buildHasresultsAgentBrief({
        host: opts.host,
        guid: opts.guid,
        cwd: opts.cwd,
      }).rules,
    });
  }

  return {
    exitCode: 0,
    liveWritten: !!(result && result.liveWritten),
    result,
  };
}

/**
 * Process one GUID: lock, run agent, clear hasresults on success.
 * @param {object} opts
 */
async function processHasresultsGuid(opts) {
  const host = String(opts.host || opts.hostkey || '').trim();
  const guid = String(opts.guid || '').trim();
  const key = String(opts.key || `${host}/${guid}/`);
  if (!host || !guid) {
    return { ok: false, code: 'missing_host_guid' };
  }

  const aClubsRoot = opts.aClubsRoot != null ? String(opts.aClubsRoot) : '';
  const cwd =
    opts.cwd ||
    (aClubsRoot ? path.join(aClubsRoot, host, guid) : path.join(host, guid));

  const lockPath =
    opts.lockPath ||
    path.join(
      opts.lockDir || path.join(require('node:os').tmpdir(), 'a-search-hasresults-locks'),
      `${host}__${guid}.lock`,
    );
  const acquire =
    typeof opts.acquireLock === 'function' ? opts.acquireLock : acquireImportLock;
  const lock = acquire(lockPath, {
    pid: opts.pid,
    now: opts.nowMs,
    staleMs: opts.lockStaleMs,
  });
  if (!lock || !lock.ok) {
    return { ok: false, code: (lock && lock.code) || 'lock_held', host, guid };
  }

  const retryKey = `${host}/${guid}`;
  const retries = opts.retryCounts || new Map();
  const maxRetries =
    opts.maxRetries != null ? Number(opts.maxRetries) : DEFAULT_MAX_RETRIES;

  try {
    const runAgent =
      typeof opts.runAgent === 'function' ? opts.runAgent : defaultRunAgent;
    const agentResult = await runAgent({
      ...opts,
      host,
      hostkey: host,
      guid,
      key,
      cwd,
    });
    const exitCode =
      agentResult && agentResult.exitCode != null ? Number(agentResult.exitCode) : 1;
    const liveWritten = !!(agentResult && agentResult.liveWritten);

    if (exitCode !== 0 || !liveWritten) {
      const n = (retries.get(retryKey) || 0) + 1;
      retries.set(retryKey, n);
      if (typeof opts.log === 'function') {
        opts.log({
          ok: false,
          event: 'hasresults_agent_failed',
          host,
          guid,
          exitCode,
          liveWritten,
          retry: n,
          maxRetries,
        });
      }
      return {
        ok: false,
        code: 'agent_failed',
        host,
        guid,
        exitCode,
        liveWritten,
        retry: n,
        hasresults: 1,
      };
    }

    const clearer =
      typeof opts.clearHasResults === 'function'
        ? opts.clearHasResults
        : clearHasResults;
    const cleared = await clearer({
      Key: key,
      bucket: opts.bucket,
      now: opts.now,
      headObject: opts.headObject,
      getObject: opts.getObject,
      copyObject: opts.copyObject,
      putObject: opts.putObject,
      getObjectTagging: opts.getObjectTagging,
      putObjectTagging: opts.putObjectTagging,
    });
    if (
      cleared &&
      cleared.etag &&
      opts.selfEtags &&
      typeof opts.selfEtags.set === 'function'
    ) {
      opts.selfEtags.set(key, cleared.etag);
    }
    retries.delete(retryKey);
    if (typeof opts.log === 'function') {
      opts.log({
        ok: true,
        event: 'hasresults_cleared',
        host,
        guid,
        hasresults: 0,
      });
    }
    return {
      ok: true,
      host,
      guid,
      hasresults: 0,
      cwd,
      agentResult,
    };
  } catch (err) {
    const n = (retries.get(retryKey) || 0) + 1;
    retries.set(retryKey, n);
    if (typeof opts.log === 'function') {
      opts.log({
        ok: false,
        event: 'hasresults_agent_error',
        host,
        guid,
        error: String((err && err.message) || err),
        retry: n,
        maxRetries,
      });
    }
    return {
      ok: false,
      code: 'agent_error',
      host,
      guid,
      error: String((err && err.message) || err),
      retry: n,
      hasresults: 1,
    };
  } finally {
    if (lock && typeof lock.release === 'function') lock.release();
  }
}

/**
 * One monitor pass over all hasresults=1 GUIDs.
 * FR #5142: first re-check any GUID whose DONE set is complete but hasresults
 * is still unset (missed flip), then process hasresults=1 as before.
 * @param {object} opts
 */
async function runHasresultsMonitorPass(opts) {
  let recheck = null;
  if (!opts.skipHasresultsRecheck) {
    try {
      recheck = await recheckIncompleteHasResults(opts);
      if (recheck && recheck.flipped && typeof opts.log === 'function') {
        opts.log({
          ok: true,
          event: 'hasresults_recheck',
          scanned: recheck.scanned,
          flipped: recheck.flipped,
        });
      }
    } catch (err) {
      if (typeof opts.log === 'function') {
        opts.log({
          ok: false,
          event: 'hasresults_recheck_failed',
          error: String((err && err.message) || err),
        });
      }
      recheck = {
        scanned: 0,
        flipped: 0,
        error: String((err && err.message) || err),
      };
    }
  }

  const markers = await listHasresultsMarkers(opts);
  const actions = [];
  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i];
    const result = await processHasresultsGuid({
      ...opts,
      key: marker.key,
      host: marker.host || marker.hostkey,
      hostkey: marker.hostkey,
      guid: marker.guid,
      metadata: marker.metadata,
    });
    actions.push(result);
  }
  const out = { scanned: markers.length, actions };
  if (recheck) out.recheck = recheck;
  return out;
}

/**
 * FR #4918: marker metadata clears must not re-fire annotation when the
 * change event etag matches the monitor's selfEtags map (same pattern as
 * changeHandler). IN/ deletes are already excluded by changeEvents.
 * @param {unknown} rawEvent
 * @param {Map<string, string>|undefined} selfEtags
 */
function shouldSkipMonitorChangeEvent(rawEvent, selfEtags) {
  try {
    const event = parseChangeEvent(rawEvent);
    if (!event) return true;
    if (isExcludedKey(event.key)) return true;
    if (event.etag && selfEtags && typeof selfEtags.get === 'function') {
      const prev = selfEtags.get(event.key);
      if (prev && String(prev) === String(event.etag)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

module.exports = {
  hasResultsReady,
  buildHasresultsAgentBrief,
  listHasresultsMarkers,
  defaultRunAgent,
  processHasresultsGuid,
  runHasresultsMonitorPass,
  shouldSkipMonitorChangeEvent,
  DEFAULT_MAX_RETRIES,
};
