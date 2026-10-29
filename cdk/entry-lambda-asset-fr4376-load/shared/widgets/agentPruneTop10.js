'use strict';

/**
 * FR-207: prune dead/excluded parts from live.json; roll host-level top10.json.
 * top10.json lives only at {env}/x/{customerNumber}/top10.json across widgetGuids.
 * Cap enforced every pass (downgrade trim). Out of scope: Parts HTTP.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  assertWidgetGuid,
  hostDir,
  widgetDir,
  widgetFile,
  WIDGET_GUID_RE,
} = require('./widgetPath');
const { isFullTier, readSearches } = require('./agentWidgetContext');
const {
  LIVE_PART_CAP_FREE,
  livePartCap,
  isExcluded,
  selectWithinCap,
  writeLive,
} = require('./agentIngest');
const { readLiveArray } = require('./parts');

const TOP10_CAP = 10;
const TOP10_NAME = 'top10.json';
const LIVE_NAME = 'live.json';
const SEARCHES_NAME = 'searches.json';
const WIDGET_JSON = 'widget.json';

/**
 * @param {string} root
 * @param {string} key
 * @returns {string}
 */
function underRoot(root, key) {
  return path.join(root, ...String(key).split('/').filter(Boolean));
}

/**
 * Expired when expiresAt is a parseable time <= now.
 * @param {object} part
 * @param {Date} now
 * @returns {boolean}
 */
function isExpired(part, now) {
  if (!part || part.expiresAt == null || part.expiresAt === '') return false;
  const t = Date.parse(String(part.expiresAt));
  if (!Number.isFinite(t)) return false;
  return t <= now.getTime();
}

/**
 * Broken without HTTP: explicit flags or empty destination url.
 * @param {object} part
 * @returns {boolean}
 */
function isBroken(part) {
  if (!part || typeof part !== 'object') return true;
  if (part.broken === true) return true;
  if (part.dead === true) return true;
  const status =
    part.status != null ? String(part.status).trim().toLowerCase() : '';
  if (status === 'dead' || status === 'broken' || status === 'gone') return true;
  if (Object.prototype.hasOwnProperty.call(part, 'url')) {
    const u = part.url == null ? '' : String(part.url).trim();
    if (!u) return true;
  }
  return false;
}

/**
 * Drop expired, broken, and exclude[] matches.
 * @param {object[]} parts
 * @param {{ exclude?: object[], now?: Date }} opts
 * @returns {{ kept: object[], removed: object[] }}
 */
function pruneParts(parts, opts) {
  const exclude = (opts && opts.exclude) || [];
  const now = (opts && opts.now) || new Date();
  const kept = [];
  const removed = [];
  for (const p of parts || []) {
    if (isExcluded(p, exclude) || isExpired(p, now) || isBroken(p)) {
      removed.push(p);
      continue;
    }
    kept.push(p);
  }
  return { kept, removed };
}

/**
 * List widgetGuid directories under a customer host tree.
 * @param {string} hostAbs
 * @returns {string[]}
 */
function listWidgetGuids(hostAbs) {
  if (!fs.existsSync(hostAbs)) return [];
  const out = [];
  for (const name of fs.readdirSync(hostAbs)) {
    const abs = path.join(hostAbs, name);
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    if (!WIDGET_GUID_RE.test(name)) continue;
    out.push(name);
  }
  return out;
}

/**
 * Read layout from widget.json when present.
 * @param {string} widgetJsonAbs
 * @returns {string}
 */
function readLayout(widgetJsonAbs) {
  if (!fs.existsSync(widgetJsonAbs)) return 'horizontal';
  try {
    const doc = JSON.parse(fs.readFileSync(widgetJsonAbs, 'utf8'));
    return doc && doc.layout != null ? String(doc.layout) : 'horizontal';
  } catch {
    return 'horizontal';
  }
}

/**
 * Prune + cap one widget live.json.
 *
 * @param {{
 *   root: string,
 *   env: string,
 *   customerNumber: string|number,
 *   widgetGuid: string,
 *   upgraded?: boolean,
 *   layout?: string,
 *   now?: Date,
 * }} opts
 * @returns {object}
 */
function runPrunePass(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('prune_opts_required');
  }
  const root = opts.root == null ? '' : String(opts.root);
  if (!root) throw new Error('empty_root');
  const guid = assertWidgetGuid(opts.widgetGuid);
  const layout =
    opts.layout != null && String(opts.layout).trim()
      ? String(opts.layout).trim()
      : readLayout(
          underRoot(
            root,
            widgetFile(opts.env, opts.customerNumber, guid, WIDGET_JSON),
          ),
        );
  const fullTier = isFullTier({ upgraded: opts.upgraded, layout });
  const cap = livePartCap(fullTier);
  const now = opts.now || new Date();

  const liveAbs = underRoot(
    root,
    widgetFile(opts.env, opts.customerNumber, guid, LIVE_NAME),
  );
  const searchesAbs = underRoot(
    root,
    widgetFile(opts.env, opts.customerNumber, guid, SEARCHES_NAME),
  );

  const before = readLiveArray(liveAbs);
  const exclude = readSearches(searchesAbs).exclude;
  const { kept, removed } = pruneParts(before, { exclude, now });
  const next = selectWithinCap(kept, cap);
  writeLive(liveAbs, next);

  return {
    widgetGuid: guid,
    fullTier,
    liveCap: cap,
    livePath: liveAbs,
    before: before.length,
    removed: removed.length,
    after: next.length,
  };
}

/**
 * Roll host-level top10.json from all widget live.json files.
 *
 * @param {{
 *   root: string,
 *   env: string,
 *   customerNumber: string|number,
 *   cap?: number,
 * }} opts
 * @returns {object}
 */
function rollHostTop10(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('top10_opts_required');
  }
  const root = opts.root == null ? '' : String(opts.root);
  if (!root) throw new Error('empty_root');
  const cap = opts.cap != null ? Number(opts.cap) : TOP10_CAP;
  const hostKey = hostDir(opts.env, opts.customerNumber);
  const hostAbs = underRoot(root, hostKey);
  fs.mkdirSync(hostAbs, { recursive: true });

  const guids = listWidgetGuids(hostAbs);
  const pool = [];
  for (const guid of guids) {
    const liveAbs = underRoot(
      root,
      widgetFile(opts.env, opts.customerNumber, guid, LIVE_NAME),
    );
    const parts = readLiveArray(liveAbs);
    for (const p of parts) {
      if (!p || typeof p !== 'object') continue;
      pool.push({
        ...p,
        widgetGuid: guid,
      });
    }
  }

  // Dedupe by partNumber across widgets (best score/price wins via selectWithinCap order).
  const byId = new Map();
  for (const p of pool) {
    const id = p.partNumber != null ? String(p.partNumber) : '';
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, p);
      continue;
    }
    const ranked = selectWithinCap([prev, p], 1);
    byId.set(id, ranked[0]);
  }

  const top = selectWithinCap([...byId.values()], Math.max(0, cap));
  const top10Path = path.join(hostAbs, TOP10_NAME);
  const doc = {
    parts: top,
    updatedAt: new Date().toISOString(),
    rolledBy: 'fr-207-prune-top10',
    sourceWidgets: guids.length,
  };
  fs.writeFileSync(top10Path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

  // Fail-when: no per-widget top10.json required / written by this pass.
  return {
    top10Path,
    length: top.length,
    cap: Math.max(0, cap),
    widgets: guids.length,
  };
}

/**
 * Sweep: prune every widget under the customer, then roll host top10.
 * Driven by daily sweep / tier_changed (#1343 / #1345).
 *
 * @param {{
 *   root: string,
 *   env: string,
 *   customerNumber: string|number,
 *   upgraded?: boolean,
 *   now?: Date,
 *   top10Cap?: number,
 * }} opts
 * @returns {object}
 */
function runSweepPass(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('sweep_opts_required');
  }
  const root = opts.root == null ? '' : String(opts.root);
  if (!root) throw new Error('empty_root');
  const hostAbs = underRoot(root, hostDir(opts.env, opts.customerNumber));
  const guids = listWidgetGuids(hostAbs);
  const pruned = [];
  for (const guid of guids) {
    const layout = readLayout(
      underRoot(
        root,
        widgetFile(opts.env, opts.customerNumber, guid, WIDGET_JSON),
      ),
    );
    pruned.push(
      runPrunePass({
        root,
        env: opts.env,
        customerNumber: opts.customerNumber,
        widgetGuid: guid,
        upgraded: opts.upgraded,
        layout,
        now: opts.now,
      }),
    );
  }
  const top10 = rollHostTop10({
    root,
    env: opts.env,
    customerNumber: opts.customerNumber,
    cap: opts.top10Cap != null ? opts.top10Cap : TOP10_CAP,
  });
  return { pruned, top10, widgets: guids.length };
}

module.exports = {
  TOP10_CAP,
  isExpired,
  isBroken,
  pruneParts,
  listWidgetGuids,
  runPrunePass,
  rollHostTop10,
  runSweepPass,
  LIVE_PART_CAP_FREE,
};
