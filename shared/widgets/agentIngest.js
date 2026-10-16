'use strict';

/**
 * FR-206 / FR-3344: Agent ingest IN/ folder -> live.json then delete consumed files.
 * Writers push one JSON file per search under IN/ (never merge into a single in.json).
 * Safe consume: move ready IN/*.json into IN/.processing/ -> merge -> delete processing.
 * Files written to IN/ during a pass remain for the next in_ready event.
 * Skips searches.json exclude[]; enforces live part cap on write (#1345):
 * free=10, fullTier (upgraded+fullscreen)=500. Agent is only writer of live.json.
 * Out of scope: prune / top10 roll (FR-207).
 */

const fs = require('node:fs');
const path = require('node:path');
const { assertWidgetGuid, widgetDir, widgetFile } = require('./widgetPath');
const { isFullTier, readSearches } = require('./agentWidgetContext');
const { readLiveArray } = require('./parts');

const LIVE_PART_CAP_FREE = 10;
const LIVE_PART_CAP_FULL = 500;
/** FR-3344: inbound search results folder (replaces single in.json). */
const IN_DIR_NAME = 'IN';
const IN_PROCESSING_DIR_NAME = '.processing';
const LIVE_NAME = 'live.json';
const SEARCHES_NAME = 'searches.json';

/**
 * @param {string} root
 * @param {string} key
 * @returns {string}
 */
function underRoot(root, key) {
  return path.join(root, ...String(key).split('/').filter(Boolean));
}

/**
 * @param {boolean} fullTier
 * @returns {number}
 */
function livePartCap(fullTier) {
  return fullTier ? LIVE_PART_CAP_FULL : LIVE_PART_CAP_FREE;
}

/**
 * Map normalised IN item to live.json part shape.
 * @param {object} item
 * @param {number} index
 * @returns {object|null}
 */
function mapInItem(item, index) {
  if (!item || typeof item !== 'object') return null;
  const id =
    item.partNumber != null
      ? String(item.partNumber).trim()
      : item.id != null
        ? String(item.id).trim()
        : '';
  if (!id) return null;
  const title =
    item.title != null
      ? String(item.title)
      : item.name != null
        ? String(item.name)
        : id;
  const priceRaw = item.price;
  const price =
    priceRaw == null || priceRaw === ''
      ? null
      : Number(priceRaw);
  const scoreRaw = item.score;
  const score =
    scoreRaw == null || scoreRaw === ''
      ? 0
      : Number(scoreRaw);
  const part = {
    partNumber: id,
    id,
    title,
    price: Number.isFinite(price) ? price : null,
    currency: item.currency != null ? String(item.currency) : undefined,
    merchant:
      item.merchant != null
        ? String(item.merchant)
        : item.source != null
          ? String(item.source)
          : undefined,
    image:
      item.image != null
        ? String(item.image)
        : item.img != null
          ? String(item.img)
          : undefined,
    url: item.url != null ? String(item.url) : undefined,
    seenAt:
      item.seenAt != null
        ? String(item.seenAt)
        : new Date().toISOString(),
    score: Number.isFinite(score) ? score : 0,
    expiresAt: item.expiresAt != null ? String(item.expiresAt) : undefined,
    ingestedAt: new Date().toISOString(),
    ingestIndex: index,
  };
  for (const k of Object.keys(part)) {
    if (part[k] === undefined) delete part[k];
  }
  return part;
}

/**
 * @param {object} part
 * @param {object[]} exclude
 * @returns {boolean}
 */
function isExcluded(part, exclude) {
  if (!part || !Array.isArray(exclude) || !exclude.length) return false;
  const partId = part.partNumber != null ? String(part.partNumber) : '';
  const title = part.title != null ? String(part.title).toLowerCase() : '';
  for (const rule of exclude) {
    if (!rule || typeof rule !== 'object') continue;
    if (rule.partId != null && String(rule.partId) === partId) return true;
    if (rule.match != null && String(rule.match).trim()) {
      const m = String(rule.match).trim().toLowerCase();
      if (m && title.includes(m)) return true;
    }
  }
  return false;
}

/**
 * Merge live + incoming by partNumber; incoming wins on conflict.
 * @param {object[]} live
 * @param {object[]} incoming
 * @param {object[]} exclude
 * @returns {object[]}
 */
function mergeParts(live, incoming, exclude) {
  const map = new Map();
  const add = (p) => {
    if (!p || isExcluded(p, exclude)) return;
    const key = p.partNumber != null ? String(p.partNumber) : '';
    if (!key) return;
    map.set(key, p);
  };
  for (const p of live || []) add(p);
  for (const p of incoming || []) add(p);
  return [...map.values()];
}

/**
 * Rank score desc, price asc (nulls last), keep top N.
 * @param {object[]} parts
 * @param {number} cap
 * @returns {object[]}
 */
function selectWithinCap(parts, cap) {
  const n = Math.max(0, Number(cap) || 0);
  const list = (parts || []).slice();
  list.sort((a, b) => {
    const sa = Number.isFinite(Number(a && a.score)) ? Number(a.score) : 0;
    const sb = Number.isFinite(Number(b && b.score)) ? Number(b.score) : 0;
    if (sb !== sa) return sb - sa;
    const pa = a && a.price != null && Number.isFinite(Number(a.price))
      ? Number(a.price)
      : Number.POSITIVE_INFINITY;
    const pb = b && b.price != null && Number.isFinite(Number(b.price))
      ? Number(b.price)
      : Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    const ia = a && a.partNumber != null ? String(a.partNumber) : '';
    const ib = b && b.partNumber != null ? String(b.partNumber) : '';
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
  return list.slice(0, n);
}

/**
 * Read IN file payload as array.
 * @param {string} abs
 * @returns {object[]}
 */
function readInArray(abs) {
  if (!fs.existsSync(abs)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.parts)) return raw.parts;
    return [];
  } catch {
    return [];
  }
}

/**
 * @param {string} abs
 * @param {object[]} parts
 */
function writeLive(abs, parts) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(parts, null, 2)}\n`, 'utf8');
}

/**
 * Sanitize searchId for a single path segment filename.
 * @param {unknown} searchId
 * @returns {string}
 */
function assertSearchId(searchId) {
  const s = searchId == null ? '' : String(searchId).trim();
  if (!s) {
    const err = new Error('empty_search_id');
    err.code = 'empty_search_id';
    throw err;
  }
  if (s.includes('..') || s.includes('/') || s.includes('\\') || s.includes('\0')) {
    const err = new Error('invalid_search_id');
    err.code = 'invalid_search_id';
    throw err;
  }
  return s;
}

/**
 * Absolute path to widget IN/ directory.
 * @param {{ root: string, env: string, customerNumber: string|number, widgetGuid: string }} opts
 * @returns {string}
 */
function inDirAbs(opts) {
  const guid = assertWidgetGuid(opts.widgetGuid);
  return underRoot(
    opts.root,
    `${widgetDir(opts.env, opts.customerNumber, guid)}/${IN_DIR_NAME}`,
  );
}

/**
 * List ready IN/*.json (excludes .processing and non-json).
 * @param {{ root: string, env: string, customerNumber: string|number, widgetGuid: string }} opts
 * @returns {string[]} absolute paths
 */
function listReadyInFiles(opts) {
  const dir = inDirAbs(opts);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith('.json') && !n.startsWith('.'))
    .map((n) => path.join(dir, n))
    .filter((abs) => {
      try {
        return fs.statSync(abs).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

/**
 * Writer helper: one search -> one file under IN/{searchId}.json (FR-3344).
 * Never merges into a single in.json.
 *
 * @param {{
 *   root: string,
 *   env: string,
 *   customerNumber: string|number,
 *   widgetGuid: string,
 *   searchId: string,
 *   parts: object[],
 * }} opts
 * @returns {string} absolute path written
 */
function writeInSearchFile(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('write_in_opts_required');
  }
  const root = opts.root == null ? '' : String(opts.root);
  if (!root) throw new Error('empty_root');
  const searchId = assertSearchId(opts.searchId);
  const guid = assertWidgetGuid(opts.widgetGuid);
  const dir = inDirAbs({
    root,
    env: opts.env,
    customerNumber: opts.customerNumber,
    widgetGuid: guid,
  });
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, `${searchId}.json`);
  const parts = Array.isArray(opts.parts) ? opts.parts : [];
  fs.writeFileSync(abs, `${JSON.stringify(parts, null, 2)}\n`, 'utf8');
  return abs;
}

/**
 * Run FR-206 / FR-3344 ingest pass for one widgetGuid.
 *
 * @param {{
 *   root: string,
 *   env: string,
 *   customerNumber: string|number,
 *   widgetGuid: string,
 *   upgraded?: boolean,
 *   layout?: string,
 * }} opts
 * @returns {object}
 */
function runIngestPass(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('ingest_opts_required');
  }
  const root = opts.root == null ? '' : String(opts.root);
  if (!root) throw new Error('empty_root');
  const guid = assertWidgetGuid(opts.widgetGuid);
  const fullTier = isFullTier({
    upgraded: opts.upgraded,
    layout: opts.layout,
  });
  const cap = livePartCap(fullTier);

  const dirAbs = underRoot(
    root,
    widgetDir(opts.env, opts.customerNumber, guid),
  );
  fs.mkdirSync(dirAbs, { recursive: true });

  const inAbsDir = inDirAbs({
    root,
    env: opts.env,
    customerNumber: opts.customerNumber,
    widgetGuid: guid,
  });
  const processingDir = path.join(inAbsDir, IN_PROCESSING_DIR_NAME);
  const liveAbs = underRoot(
    root,
    widgetFile(opts.env, opts.customerNumber, guid, LIVE_NAME),
  );
  const searchesAbs = underRoot(
    root,
    widgetFile(opts.env, opts.customerNumber, guid, SEARCHES_NAME),
  );

  const liveBefore = readLiveArray(liveAbs);

  // Resume crashed processing first.
  let claimed = [];
  if (fs.existsSync(processingDir)) {
    claimed = fs
      .readdirSync(processingDir)
      .filter((n) => n.toLowerCase().endsWith('.json'))
      .map((n) => path.join(processingDir, n))
      .filter((abs) => {
        try {
          return fs.statSync(abs).isFile();
        } catch {
          return false;
        }
      })
      .sort();
  }

  if (!claimed.length) {
    const ready = listReadyInFiles({
      root,
      env: opts.env,
      customerNumber: opts.customerNumber,
      widgetGuid: guid,
    });
    if (!ready.length) {
      return {
        skipped: true,
        reason: 'no_in',
        widgetGuid: guid,
        fullTier,
        liveCap: cap,
        livePath: liveAbs,
        liveLength: liveBefore.length,
        ingested: 0,
        inGone: true,
      };
    }
    fs.mkdirSync(processingDir, { recursive: true });
    for (const abs of ready) {
      const dest = path.join(processingDir, path.basename(abs));
      fs.renameSync(abs, dest);
      claimed.push(dest);
    }
  }

  const rawIncoming = [];
  for (const abs of claimed) {
    rawIncoming.push(...readInArray(abs));
  }
  const mapped = [];
  for (let i = 0; i < rawIncoming.length; i++) {
    const p = mapInItem(rawIncoming[i], i);
    if (p) mapped.push(p);
  }

  const exclude = readSearches(searchesAbs).exclude;
  const merged = mergeParts(liveBefore, mapped, exclude);
  const nextLive = selectWithinCap(merged, cap);
  writeLive(liveAbs, nextLive);

  for (const abs of claimed) {
    try {
      fs.unlinkSync(abs);
    } catch {
      /* ignore */
    }
  }
  // Fail-when: processing files must be gone.
  if (fs.existsSync(processingDir)) {
    const left = fs.readdirSync(processingDir).filter((n) => n.toLowerCase().endsWith('.json'));
    if (left.length) {
      const err = new Error('processing_not_deleted');
      err.code = 'processing_not_deleted';
      throw err;
    }
  }

  const readyLeft = listReadyInFiles({
    root,
    env: opts.env,
    customerNumber: opts.customerNumber,
    widgetGuid: guid,
  });

  return {
    skipped: false,
    widgetGuid: guid,
    fullTier,
    liveCap: cap,
    livePath: liveAbs,
    liveLength: nextLive.length,
    ingested: mapped.length,
    excludedSkipped: mapped.filter((p) => isExcluded(p, exclude)).length,
    filesConsumed: claimed.length,
    inGone: readyLeft.length === 0,
  };
}

module.exports = {
  LIVE_PART_CAP_FREE,
  LIVE_PART_CAP_FULL,
  IN_DIR_NAME,
  livePartCap,
  mapInItem,
  isExcluded,
  mergeParts,
  selectWithinCap,
  runIngestPass,
  writeLive,
  writeInSearchFile,
  listReadyInFiles,
  inDirAbs,
  assertSearchId,
};
