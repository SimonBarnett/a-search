'use strict';

/**
 * FR-3951: run one drain message --- local search worker or maintainer (Parts).
 */

const path = require('node:path');

const { assertWritableDatabaseFromEnv } = require('./dbWriterGuard');
const { createAClubsPutObject, writeAClubsIn } = require('./writeAClubsIn');
const { hostGuidFromMessage } = require('./aClubsInPath');

/**
 * @param {string} source
 * @param {string} [repoRoot]
 * @returns {string}
 */
function localWorkerPath(source, repoRoot) {
  const id = String(source || '').trim();
  if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new Error('invalid_source');
  }
  const root = repoRoot != null ? String(repoRoot) : path.join(__dirname, '..', '..');
  return path.join(root, 'providers', 'local', id, 'src', 'worker.js');
}

/**
 * @param {object} msg
 * @returns {boolean}
 */
function isMaintainerJob(msg) {
  if (!msg || typeof msg !== 'object') return false;
  const kind = String(msg.kind || msg.job || '').trim().toLowerCase();
  if (kind === 'maintainer' || kind === 'feed' || kind === 'parts') return true;
  return String(msg.source || '').trim().toLowerCase() === 'maintainer';
}

/**
 * @param {object} msg
 * @param {{
 *   aClubsRoot: string,
 *   envVars?: Record<string, string|undefined>,
 *   repoRoot?: string,
 *   loadWorker?: (source: string) => { run: Function },
 *   runMaintainer?: (msg: object, deps: object) => Promise<object>,
 *   queryParts?: Function,
 *   connect?: Function,
 *   touchLastmod?: Function,
 * }} [deps]
 */
async function runDrainJob(msg, deps) {
  const envVars = (deps && deps.envVars) || process.env;
  assertWritableDatabaseFromEnv(envVars);

  const aClubsRoot =
    (deps && deps.aClubsRoot) ||
    envVars.A_CLUBS_ROOT ||
    envVars.A_SEARCH_A_CLUBS_ROOT ||
    '';
  if (!String(aClubsRoot).trim()) {
    throw new Error('A_CLUBS_ROOT required');
  }

  if (isMaintainerJob(msg)) {
    const runMaintainer =
      deps && typeof deps.runMaintainer === 'function'
        ? deps.runMaintainer
        : null;
    if (!runMaintainer) {
      throw new Error('maintainer_runner_required');
    }
    const outcome = await runMaintainer(msg, {
      env: envVars,
      connect: deps && deps.connect,
    });
    return { ok: true, kind: 'maintainer', outcome };
  }

  const source = msg && msg.source != null ? String(msg.source).trim() : '';
  if (!source) throw new Error('source_required');
  // Touch host/guid early so bad messages fail before MSSQL work.
  hostGuidFromMessage(msg);

  const loadWorker =
    deps && typeof deps.loadWorker === 'function'
      ? deps.loadWorker
      : (id) => require(localWorkerPath(id, deps && deps.repoRoot));

  const worker = loadWorker(source);
  if (!worker || typeof worker.run !== 'function') {
    throw new Error(`local_worker_missing:${source}`);
  }

  // FR #4447: sql IN files are {searchid}-sql.json (inResultSchema).
  let writeMsg = msg;
  if (source.toLowerCase() === 'sql') {
    const base = String(
      msg.searchid != null ? msg.searchid : msg.searchId || '',
    )
      .trim()
      .replace(/-sql$/i, '');
    if (base) {
      writeMsg = { ...msg, searchId: `${base}-sql`, searchid: base, source: 'sql' };
    }
  }

  const putObject = createAClubsPutObject({ root: aClubsRoot, msg: writeMsg });
  const workerEnv = {
    ...envVars,
    S3_RESULTS_BUCKET: envVars.S3_RESULTS_BUCKET || 'a-clubs',
  };

  const result = await worker.run(msg, {
    env: workerEnv,
    putObject,
    queryParts: deps && deps.queryParts,
    connect: deps && deps.connect,
    touchLastmod: deps && deps.touchLastmod,
  });

  // FR #4823: do not synthesize empty IN files; only workers with products write IN/.
  if (result && result.key) {
    // worker wrote IN
  } else if (
    result &&
    Array.isArray(result.products) &&
    result.products.length > 0 &&
    !result.key
  ) {
    writeAClubsIn({
      root: aClubsRoot,
      msg: writeMsg,
      products: result.products,
    });
  }

  return {
    ok: !!(result && result.ok !== false),
    kind: 'search',
    source,
    result,
  };
}

module.exports = {
  localWorkerPath,
  isMaintainerJob,
  runDrainJob,
};
