'use strict';

/**
 * FR #4463: daily deterministic parts import (affiliates + merchants).
 * Exit codes: 0 ok, 1 feed failure(s), 2 lock/precheck.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { acquireImportLock } = require('./lock');
const { loadAllProviderConfigs } = require('./providerConfig');
const { parseAndMapFeed } = require('./parseMapped');
const { validateBeforeMerge } = require('./validateFeed');
const { redactSecrets } = require('./mapRow');
const {
  reportImportFailure,
  maybeCloseFailureIssue,
} = require('./reportImportFailure');

const WRITE_DBS = new Set(['a_search', 'a_search_sandbox']);

/**
 * FR #4943: raise (or comment) a GitHub issue for a failure fingerprint.
 * Fail-soft: never throw into the import loop.
 * @param {object} opts runDailyImport opts
 * @param {object} failure
 */
async function raiseFailureIssue(opts, failure) {
  const report =
    typeof opts.reportFailure === 'function'
      ? opts.reportFailure
      : reportImportFailure;
  try {
    const result = await report({
      ...failure,
      database: opts.database,
      host: opts.host || os.hostname(),
      outboxRoot: opts.failureRoot || opts.outboxRoot,
      token: opts.ghToken,
      github: opts.github,
      fetch: opts.fetch,
      repo: opts.repo,
    });
    if (
      result &&
      result.ok &&
      result.issueNumber != null &&
      opts.store &&
      typeof opts.store.stampFailureIssue === 'function'
    ) {
      await opts.store.stampFailureIssue({
        RunId: failure.runId,
        ProviderId: failure.provider,
        FeedKey: failure.feedKey,
        ErrorCode: failure.errorCode,
        IssueNumber: result.issueNumber,
        IssueUrl: result.issueUrl,
        AgentStatus: `issue:${result.issueNumber}`,
      });
    }
    return result;
  } catch (err) {
    if (typeof opts.log === 'function') {
      opts.log(
        `failure_issue_error ${redactSecrets(String((err && err.message) || err))}`,
      );
    }
    return { ok: false, skipped: 'raise_threw' };
  }
}

/**
 * @param {object} opts
 */
function precheck(opts) {
  const db = String(opts.database || '').trim().toLowerCase();
  if (!WRITE_DBS.has(db)) {
    return { ok: false, code: 'precheck_db', detail: db || 'empty' };
  }
  if (opts.ftsInstalled === false) {
    return { ok: false, code: 'precheck_fts', detail: 'IsFullTextInstalled=0' };
  }
  for (const root of opts.mountRoots || []) {
    if (!fs.existsSync(root)) {
      return { ok: false, code: 'precheck_mount', detail: root };
    }
  }
  const cfg = loadAllProviderConfigs(opts.repoRoot);
  if (!cfg.ok) {
    return { ok: false, code: 'precheck_provider_json', detail: cfg.errors.join(';') };
  }
  return { ok: true, configs: cfg.configs };
}

/**
 * Scan mount for dated feed files matching provider glob pattern (simplified).
 * @param {object} providerJson
 * @param {string} mountRoot e.g. D:\s3\a-affiliates
 */
function listFeedFiles(providerJson, mountRoot, fsApi = fs) {
  const bucket = providerJson.source.bucket;
  const provider = providerJson.provider;
  const out = [];
  const providerDir = path.join(mountRoot, provider);
  if (!fsApi.existsSync(providerDir)) return out;

  const isMerchant = bucket === 'a-merchants';
  for (const feedKey of fsApi.readdirSync(providerDir)) {
    const feedDir = path.join(providerDir, feedKey);
    if (!fsApi.statSync(feedDir).isDirectory()) continue;
    if (['AGENT.md', 'SKILLS.md', '_invites'].includes(feedKey)) continue;

    const scanDir = isMerchant ? path.join(feedDir, 'parts') : feedDir;
    if (!fsApi.existsSync(scanDir)) continue;

    for (const name of fsApi.readdirSync(scanDir)) {
      if (!/^\d{4}-\d{2}-\d{2}\./.test(name)) continue;
      const full = path.join(scanDir, name);
      if (!fsApi.statSync(full).isFile()) continue;
      const st = fsApi.statSync(full);
      const rel = isMerchant
        ? `${provider}/${feedKey}/parts/${name}`
        : `${provider}/${feedKey}/${name}`;
      const version = `${st.size}-${Math.floor(st.mtimeMs)}`;
      out.push({
        provider,
        feedKey,
        fileKey: rel,
        path: full,
        version,
        date: name.slice(0, 10),
      });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.fileKey.localeCompare(b.fileKey));
  return out;
}

/**
 * @param {object} opts
 * @returns {Promise<{ exitCode: number, runId?: number, results?: object[] }>}
 */
async function runDailyImport(opts) {
  const dryRun = !!opts.dryRun;
  const log = typeof opts.log === 'function' ? opts.log : (s) => console.log(s);
  const store = opts.store;
  if (!store) throw new Error('store_required');

  const lock = acquireImportLock(opts.lockPath, { now: opts.now });
  if (!lock.ok) {
    // FR #4943: fresh lock_held is normal overlap — no issue.
    log('lock_held file');
    return { exitCode: 2, code: 'lock_held' };
  }
  if (lock.staleTakeover) {
    log(`lock_held_stale ageMs=${lock.ageMs || ''}`);
    await raiseFailureIssue(opts, {
      provider: '_run',
      feedKey: '_lock',
      errorCode: 'lock_held_stale',
      errorDetail: `stale import.lock taken over after ${lock.ageMs || '?'}ms`,
      runId: null,
    });
  }

  if (!(await store.tryAppLock())) {
    lock.release();
    // Fresh applock contention — normal overlap, no issue.
    log('lock_held applock');
    return { exitCode: 2, code: 'lock_held' };
  }

  try {
    const pc = precheck(opts);
    if (!pc.ok) {
      log(`precheck_failed ${pc.code} ${pc.detail || ''}`);
      await raiseFailureIssue(opts, {
        provider: '_run',
        feedKey: '_precheck',
        errorCode: pc.code,
        errorDetail: pc.detail || '',
        runId: null,
      });
      return { exitCode: 2, code: pc.code, detail: pc.detail };
    }

    const run = await store.beginRun(dryRun ? 'dry-run' : 'run');
    const results = [];
    let anyFail = false;

    if (!dryRun && typeof store.drainLeftoverStaging === 'function') {
      const drained = await store.drainLeftoverStaging();
      if (drained && drained.feeds) {
        log(`drained_leftover_staging feeds=${drained.feeds}`);
      }
    }

    // Purge requests first
    const pendingPurge = store.purgeRequests.splice(0, store.purgeRequests.length);
    for (const pr of pendingPurge) {
      if (!dryRun) {
        await store.hardPurge(pr.ProviderId, pr.FeedKey);
        pr.ProcessedRunId = run.runId;
      }
      results.push({ kind: 'purge', ...pr });
    }

    const configs = (pc.configs || []).filter((c) => c.enabled);
    const filterProvider = opts.provider || null;
    const filterFeed = opts.feed || null;

    for (const cfg of configs) {
      if (filterProvider && cfg.provider !== filterProvider) continue;
      const mount =
        cfg.source.bucket === 'a-merchants'
          ? opts.merchantsRoot
          : opts.affiliatesRoot;
      const files = listFeedFiles(cfg, mount, opts.fs || fs);
      const byFeed = new Map();
      for (const f of files) {
        if (filterFeed && f.feedKey !== filterFeed) continue;
        if (!byFeed.has(f.feedKey)) byFeed.set(f.feedKey, []);
        byFeed.get(f.feedKey).push(f);
      }

      for (const [feedKey, feedFiles] of byFeed) {
        // newest is snapshot; older superseded unless incremental
        const sorted = [...feedFiles].sort((a, b) => a.date.localeCompare(b.date));
        const newest = sorted[sorted.length - 1];
        for (const f of sorted) {
          if (cfg.mode === 'full' && f !== newest) {
            results.push({
              provider: cfg.provider,
              feedKey,
              fileKey: f.fileKey,
              status: 'superseded',
            });
            continue;
          }
          if ((await store.isFileOk(f.fileKey, f.version)) && !opts.force) {
            results.push({
              provider: cfg.provider,
              feedKey,
              fileKey: f.fileKey,
              status: 'already_ok',
            });
            continue;
          }

          const started = Date.now();
          try {
            const marker = opts.markers && opts.markers[`${cfg.provider}/${feedKey}`];
            if (cfg.class === 'merchant' && marker) {
              const st = String(marker.status || marker.shopStatus || '').toLowerCase();
              if (st === 'unpaid' || st === 'suspended') {
                results.push({
                  provider: cfg.provider,
                  feedKey,
                  status: 'skipped_unpaid',
                });
                continue;
              }
            }

            const raw = (opts.fs || fs).readFileSync(f.path);
            const parsed = parseAndMapFeed(raw, cfg, {
              feedKey,
              shopdomain: marker && marker.shopdomain,
            });

            const active = await store.listActive(cfg.provider, feedKey);
            const stagedKeys = new Set(parsed.staged.map((r) => String(r.MerchantProductId)));
            let wouldDelete = 0;
            if (cfg.deleteMissing === 'soft' || cfg.deleteMissing === 'hard') {
              wouldDelete = active.filter((a) => !stagedKeys.has(a.MerchantProductId)).length;
            }

            const prevGood =
              opts.previousGoodCounts &&
              opts.previousGoodCounts[`${cfg.provider}/${feedKey}`];

            const gate = validateBeforeMerge({
              staged: parsed.staged,
              rejects: parsed.rejects,
              rowsRead: parsed.rowsRead,
              validation: cfg.validation,
              previousGoodCount: prevGood,
              wouldDelete,
              activeCount: active.length,
            });

            if (!gate.ok) {
              anyFail = true;
              const sampleDir = path.join(
                opts.failureRoot || path.join(process.cwd(), 'import-failures'),
                String(run.runId),
                cfg.provider,
                feedKey,
              );
              fs.mkdirSync(sampleDir, { recursive: true });
              const samplePath = path.join(sampleDir, `sample.${cfg.format}`);
              const sample = [
                ...parsed.rejects.slice(0, 50).map((r) => r.rawRow),
              ].join('\n');
              fs.writeFileSync(samplePath, redactSecrets(sample), 'utf8');
              await store.addFailure({
                RunId: run.runId,
                ProviderId: cfg.provider,
                FeedKey: feedKey,
                FileKey: f.fileKey,
                ErrorCode: gate.code,
                ErrorDetail: redactSecrets(gate.detail || ''),
                SampleBadRowsPath: samplePath,
                ProviderJsonSha: cfg._sha256,
                AgentStatus: null,
              });
              await raiseFailureIssue(opts, {
                provider: cfg.provider,
                feedKey,
                fileKey: f.fileKey,
                version: f.version,
                errorCode: gate.code,
                errorDetail: gate.detail || '',
                sampleBadRowsPath: samplePath,
                providerJsonSha: cfg._sha256,
                runId: run.runId,
                rowsRead: parsed.rowsRead,
                rowsStaged: parsed.staged.length,
                rowsRejected: parsed.rejects.length,
              });
              if (typeof opts.launchAgent === 'function') {
                const launched = await opts.launchAgent({
                  provider: cfg.provider,
                  feedKey,
                  fileKey: f.fileKey,
                  version: f.version,
                  errorCode: gate.code,
                });
                if (launched && launched.started) {
                  store.failures[store.failures.length - 1].AgentStatus = 'started';
                }
              }
              results.push({
                provider: cfg.provider,
                feedKey,
                fileKey: f.fileKey,
                status: 'failed',
                code: gate.code,
                detail: gate.detail,
              });
              continue;
            }

            const merge = await store.mergeFeed({
              runId: run.runId,
              providerId: cfg.provider,
              feedKey,
              className: cfg.class,
              staged: parsed.staged,
              deleteMissing: cfg.deleteMissing,
              dryRun,
              largeFeedRows: opts.largeFeedRows != null ? opts.largeFeedRows : cfg.largeFeedRows,
              failAfterBatch: opts.failAfterBatch,
            });

            if (!dryRun) {
              await store.markFileOk(f.fileKey, f.version, cfg.provider, feedKey);
              if (typeof opts.deleteFile === 'function') {
                await opts.deleteFile(f.path);
              } else if (opts.deleteOnSuccess) {
                try {
                  fs.unlinkSync(f.path);
                } catch {
                  // keep
                }
              }
              if (typeof opts.stampMarker === 'function') {
                await opts.stampMarker({
                  provider: cfg.provider,
                  feedKey,
                  patch: {
                    lastimport: new Date().toISOString(),
                    lastimportstatus: 'ok',
                    importcount: merge.inserted + merge.updated,
                    removedcount: merge.deleted,
                  },
                });
              }
            }

            results.push({
              provider: cfg.provider,
              feedKey,
              fileKey: f.fileKey,
              status: dryRun ? 'dry-run-ok' : 'ok',
              ...merge,
              rowsRead: parsed.rowsRead,
              rowsRejected: parsed.rejects.length,
              durationMs: Date.now() - started,
            });
          } catch (err) {
            anyFail = true;
            const code = (err && err.code) || 'sql_error';
            await store.addFailure({
              RunId: run.runId,
              ProviderId: cfg.provider,
              FeedKey: feedKey,
              FileKey: f.fileKey,
              ErrorCode: code,
              ErrorDetail: redactSecrets(String(err && err.message)),
              ProviderJsonSha: cfg._sha256,
            });
            await raiseFailureIssue(opts, {
              provider: cfg.provider,
              feedKey,
              fileKey: f.fileKey,
              version: f.version,
              errorCode: code,
              errorDetail: String(err && err.message),
              providerJsonSha: cfg._sha256,
              runId: run.runId,
            });
            if (typeof opts.launchAgent === 'function') {
              await opts.launchAgent({
                provider: cfg.provider,
                feedKey,
                fileKey: f.fileKey,
                version: f.version,
                errorCode: code,
              });
            }
            results.push({
              provider: cfg.provider,
              feedKey,
              fileKey: f.fileKey,
              status: 'failed',
              code,
              detail: String(err && err.message),
            });
          }
        }
      }
    }

    try {
      await store.endOfRunHealth();
      for (const r of results) {
        if (r.status === 'ok' && r.provider && r.feedKey) {
          const activeRows = await store.listActive(r.provider, r.feedKey);
          const title = (activeRows[0] || {}).Title || '';
          const token = String(title).split(/\s+/).find((w) => w.length >= 3);
          if (token && !(await store.containstableProbe(r.provider, r.feedKey, token))) {
            anyFail = true;
            await store.addFailure({
              RunId: run.runId,
              ProviderId: r.provider,
              FeedKey: r.feedKey,
              ErrorCode: 'fts_failed',
              ErrorDetail: 'containstable_probe_miss',
            });
            await raiseFailureIssue(opts, {
              provider: r.provider,
              feedKey: r.feedKey,
              errorCode: 'fts_failed',
              errorDetail: 'containstable_probe_miss',
              runId: run.runId,
            });
          }
        }
      }
    } catch (err) {
      anyFail = true;
      await store.addFailure({
        RunId: run.runId,
        ProviderId: '_run',
        FeedKey: '_fts',
        ErrorCode: (err && err.code) || 'fts_failed',
        ErrorDetail: String(err && err.message),
      });
      await raiseFailureIssue(opts, {
        provider: '_run',
        feedKey: '_fts',
        errorCode: (err && err.code) || 'fts_failed',
        errorDetail: String(err && err.message),
        runId: run.runId,
      });
      if (typeof opts.launchAgent === 'function') {
        await opts.launchAgent({
          provider: '_run',
          feedKey: '_fts',
          fileKey: '',
          version: String(run.runId),
          errorCode: 'fts_failed',
        });
      }
    }

    // FR #4943: staging left non-empty after the run (#4941 class).
    if (typeof store.countStagingLeftovers === 'function') {
      try {
        const leftovers = await store.countStagingLeftovers(run.runId);
        const n = Number(leftovers && leftovers.count) || 0;
        if (n > 0) {
          anyFail = true;
          const detail = `staging_rows=${n} feeds=${JSON.stringify(
            (leftovers && leftovers.feeds) || [],
          )}`;
          await store.addFailure({
            RunId: run.runId,
            ProviderId: '_run',
            FeedKey: '_staging',
            ErrorCode: 'staging_leftover',
            ErrorDetail: redactSecrets(detail).slice(0, 2000),
          });
          await raiseFailureIssue(opts, {
            provider: '_run',
            feedKey: '_staging',
            errorCode: 'staging_leftover',
            errorDetail: detail,
            runId: run.runId,
          });
        }
      } catch (err) {
        log(
          `staging_leftover_check_error ${redactSecrets(String((err && err.message) || err))}`,
        );
      }
    }

    // FR #4943 optional: close open fingerprint issues when a feed imports OK.
    if (!dryRun && typeof maybeCloseFailureIssue === 'function') {
      for (const r of results) {
        if (r.status !== 'ok' || !r.provider || !r.feedKey) continue;
        try {
          const closer =
            typeof opts.closeFailureIssue === 'function'
              ? opts.closeFailureIssue
              : maybeCloseFailureIssue;
          await closer({
            provider: r.provider,
            feedKey: r.feedKey,
            errorCode: 'gate_failed',
            runId: run.runId,
            github: opts.github,
            token: opts.ghToken,
            fetch: opts.fetch,
            repo: opts.repo,
          });
        } catch {
          // optional path
        }
      }
    }

    return {
      exitCode: anyFail ? 1 : 0,
      runId: run.runId,
      results,
    };
  } finally {
    await store.releaseAppLock();
    lock.release();
  }
}

module.exports = {
  precheck,
  listFeedFiles,
  runDailyImport,
  raiseFailureIssue,
  WRITE_DBS,
};
