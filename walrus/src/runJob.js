'use strict';

/**
 * FR-3951: run one drain message --- local search worker or maintainer (Parts).
 */

const path = require('node:path');

const { assertWritableDatabaseFromEnv } = require('./dbWriterGuard');
const { createAClubsPutObject, writeAClubsIn } = require('./writeAClubsIn');
const { hostGuidFromMessage } = require('./aClubsInPath');
const { writeAClubsDoneFs } = require('./writeAClubsDoneFs');

/**
 * FR #4827: static requires so the SEA bundle includes every local provider.
 * Dynamic path loads are invisible to esbuild and missing inside a SEA blob.
 */
const LOCAL_WORKER_LOADERS = {
  admitad: () => require('../../providers/local/admitad/src/worker'),
  avantlink: () => require('../../providers/local/avantlink/src/worker'),
  awin: () => require('../../providers/local/awin/src/worker'),
  bigcommerce: () => require('../../providers/local/bigcommerce/src/worker'),
  ecwid: () => require('../../providers/local/ecwid/src/worker'),
  flexoffers: () => require('../../providers/local/flexoffers/src/worker'),
  impact: () => require('../../providers/local/impact/src/worker'),
  magento: () => require('../../providers/local/magento/src/worker'),
  partnerize: () => require('../../providers/local/partnerize/src/worker'),
  shopify: () => require('../../providers/local/shopify/src/worker'),
  skimlinks: () => require('../../providers/local/skimlinks/src/worker'),
  sql: () => require('../../providers/local/sql/src/worker'),
  squarespace: () => require('../../providers/local/squarespace/src/worker'),
  tradedoubler: () => require('../../providers/local/tradedoubler/src/worker'),
  webgains: () => require('../../providers/local/webgains/src/worker'),
  wix: () => require('../../providers/local/wix/src/worker'),
  woocommerce: () => require('../../providers/local/woocommerce/src/worker'),
};

/**
 * @param {string} source
 * @returns {{ run: Function }}
 */
function loadLocalWorker(source) {
  const id = String(source || '').trim().toLowerCase();
  const loader = LOCAL_WORKER_LOADERS[id];
  if (!loader) {
    const err = new Error(`local_worker_missing:${id}`);
    err.code = 'local_worker_missing';
    throw err;
  }
  return loader();
}

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
      : loadLocalWorker;

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

  // FR #4823 / MRB #4831: do not synthesize empty IN files; only workers with products write IN/.
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

  // FR #4917: terminal DONE on mapped a-clubs (serviced, products may be 0).
  let done = null;
  try {
    const productCount = Array.isArray(result && result.products)
      ? result.products.length
      : 0;
    done = writeAClubsDoneFs({
      root: aClubsRoot,
      msg: writeMsg,
      source,
      status: 'serviced',
      products: productCount,
    });
  } catch (err) {
    // Fail-soft: drain success must not roll back for a DONE write miss.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[a-search]',
        'WARN',
        'search_done_fs_write_failed',
        String((err && err.message) || err),
      );
    }
  }

  return {
    ok: !!(result && result.ok !== false),
    kind: 'search',
    source,
    result,
    done,
  };
}

module.exports = {
  localWorkerPath,
  isMaintainerJob,
  runDrainJob,
  loadLocalWorker,
  LOCAL_WORKER_LOADERS,
};
