'use strict';

/**
 * FR-205: Agent per-widgetGuid context.md + searches.json maintain.
 * Folder = {env}/x/{customerNumber}/{widgetGuid}/ (FR-232 / FR-233).
 * Folds feedback.json type:context into context.md and type:removal into
 * searches.json exclude[]. Never deletes feedback.json entries.
 * Query cap: free=3, fullTier (upgraded+fullscreen)=15 (#1345).
 * Out of scope: in.json ingest (FR-206).
 */

const fs = require('node:fs');
const path = require('node:path');
const { assertWidgetGuid, widgetDir, widgetFile } = require('./widgetPath');

const SEARCH_QUERY_CAP_FREE = 3;
const SEARCH_QUERY_CAP_FULL = 15;

/**
 * @param {string} root
 * @param {string} key
 * @returns {string}
 */
function underRoot(root, key) {
  return path.join(root, ...String(key).split('/').filter(Boolean));
}

/**
 * fullTier = upgraded && layout === fullscreen (#1345).
 * @param {{ upgraded?: boolean, layout?: string }} opts
 * @returns {boolean}
 */
function isFullTier(opts) {
  const upgraded = !!(opts && opts.upgraded);
  const layout =
    opts && opts.layout != null ? String(opts.layout).trim().toLowerCase() : '';
  return upgraded && layout === 'fullscreen';
}

/**
 * @param {boolean} fullTier
 * @returns {number}
 */
function queryCap(fullTier) {
  return fullTier ? SEARCH_QUERY_CAP_FULL : SEARCH_QUERY_CAP_FREE;
}

/**
 * @param {string} abs
 * @returns {object[]}
 */
function readJsonArray(abs) {
  if (!fs.existsSync(abs)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.entries)) return raw.entries;
    return [];
  } catch {
    return [];
  }
}

/**
 * @param {string} abs
 * @returns {{ queries: object[], exclude: object[] }}
 */
function readSearches(abs) {
  if (!fs.existsSync(abs)) return { queries: [], exclude: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const queries = raw && Array.isArray(raw.queries) ? raw.queries : [];
    const exclude = raw && Array.isArray(raw.exclude) ? raw.exclude : [];
    return { queries, exclude };
  } catch {
    return { queries: [], exclude: [] };
  }
}

/**
 * @param {object} entry feedback item
 * @returns {boolean}
 */
function isContextEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const t = String(entry.type || '').trim().toLowerCase();
  return t === 'context';
}

/**
 * @param {object} entry feedback item
 * @returns {boolean}
 */
function isRemovalEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const t = String(entry.type || '').trim().toLowerCase();
  return t === 'removal' || t === 'remove' || t === 'exclude';
}

/**
 * Fold context feedback into markdown. Never drops prior sections.
 * @param {string} existing
 * @param {object[]} feedback
 * @param {{ host?: string, widgetGuid?: string }} meta
 * @returns {string}
 */
function foldContextMd(existing, feedback, meta) {
  const host = meta && meta.host != null ? String(meta.host).trim() : '';
  const guid =
    meta && meta.widgetGuid != null ? String(meta.widgetGuid).trim() : '';
  let body =
    existing && String(existing).trim()
      ? String(existing).replace(/\s+$/, '') + '\n'
      : [
          '# Widget context',
          '',
          'Agent-maintained context for this widgetGuid (FR-205).',
          'Folds type:"context" entries from feedback.json; never deletes feedback.',
          '',
          host ? `- host: ${host}` : '',
          guid ? `- widgetGuid: ${guid}` : '',
          '',
          '## Notes',
          '',
        ]
          .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
          .join('\n') + '\n';

  const contexts = (feedback || []).filter(isContextEntry);
  for (const entry of contexts) {
    const text =
      entry.text != null
        ? String(entry.text).trim()
        : entry.otherText != null
          ? String(entry.otherText).trim()
          : '';
    if (!text) continue;
    // Skip if already present (idempotent fold).
    if (body.includes(text)) continue;
    const at = entry.at != null ? String(entry.at).trim() : '';
    body += `\n### Feedback context${at ? ` (${at})` : ''}\n\n${text}\n`;
  }
  if (!body.endsWith('\n')) body += '\n';
  return body;
}

/**
 * Merge removal feedback into exclude[]. Idempotent by partId/match+reason.
 * @param {object[]} existing
 * @param {object[]} feedback
 * @returns {object[]}
 */
function foldExclude(existing, feedback) {
  const out = Array.isArray(existing) ? existing.slice() : [];
  const keyOf = (e) => {
    const partId = e && e.partId != null ? String(e.partId) : '';
    const match = e && e.match != null ? String(e.match) : '';
    const reason = e && e.reason != null ? String(e.reason) : '';
    return `${partId}|${match}|${reason}`;
  };
  const seen = new Set(out.map(keyOf));
  for (const entry of feedback || []) {
    if (!isRemovalEntry(entry)) continue;
    const row = {
      reason:
        entry.reason != null && String(entry.reason).trim()
          ? String(entry.reason).trim()
          : 'unspecified',
      at: entry.at != null ? String(entry.at) : new Date().toISOString(),
    };
    if (entry.partId != null && String(entry.partId).trim()) {
      row.partId = String(entry.partId).trim();
    }
    if (entry.match != null && String(entry.match).trim()) {
      row.match = String(entry.match).trim();
    }
    if (entry.otherText != null && String(entry.otherText).trim()) {
      row.otherText = String(entry.otherText).trim();
    }
    const k = keyOf(row);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

/**
 * Cap queries[] to tier budget; keep first N valid {q,intent?,maxResults?}.
 * @param {object[]} queries
 * @param {number} cap
 * @returns {object[]}
 */
function boundQueries(queries, cap) {
  const n = Math.max(0, Number(cap) || 0);
  const list = Array.isArray(queries) ? queries : [];
  const out = [];
  for (const q of list) {
    if (out.length >= n) break;
    if (!q || typeof q !== 'object') continue;
    const text = q.q != null ? String(q.q).trim() : '';
    if (!text) continue;
    const row = { q: text };
    if (q.intent != null && String(q.intent).trim()) {
      row.intent = String(q.intent).trim();
    }
    if (q.maxResults != null && Number.isFinite(Number(q.maxResults))) {
      row.maxResults = Number(q.maxResults);
    }
    out.push(row);
  }
  return out;
}

/**
 * Default cheap/relevant seed queries when none exist yet.
 * @param {{ host?: string, seedQueries?: object[] }} opts
 * @param {number} cap
 * @returns {object[]}
 */
function defaultSeedQueries(opts, cap) {
  if (opts && Array.isArray(opts.seedQueries) && opts.seedQueries.length) {
    return boundQueries(opts.seedQueries, cap);
  }
  const host = opts && opts.host != null ? String(opts.host).trim() : 'shop';
  const label = host.replace(/^www\./, '').split('.')[0] || 'shop';
  const seeds = [
    { q: `${label} best deals GBP`, intent: 'cheap', maxResults: 10 },
    { q: `${label} discount UK`, intent: 'cheap', maxResults: 10 },
    { q: `${label} sale`, intent: 'relevant', maxResults: 10 },
    { q: `${label} clearance`, intent: 'cheap', maxResults: 10 },
    { q: `${label} offer`, intent: 'relevant', maxResults: 10 },
  ];
  return boundQueries(seeds, cap);
}

/**
 * Run FR-205 widget context + searches maintain pass.
 *
 * @param {{
 *   root: string,
 *   env: string,
 *   customerNumber: string|number,
 *   widgetGuid: string,
 *   host?: string,
 *   upgraded?: boolean,
 *   layout?: string,
 *   seedQueries?: object[],
 * }} opts
 * @returns {object}
 */
function runWidgetContextPass(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('widget_context_opts_required');
  }
  const root = opts.root == null ? '' : String(opts.root);
  if (!root) throw new Error('empty_root');
  const guid = assertWidgetGuid(opts.widgetGuid);
  const fullTier = isFullTier({
    upgraded: opts.upgraded,
    layout: opts.layout,
  });
  const cap = queryCap(fullTier);

  const dirKey = widgetDir(opts.env, opts.customerNumber, guid);
  const dirAbs = underRoot(root, dirKey);
  fs.mkdirSync(dirAbs, { recursive: true });

  const contextAbs = underRoot(
    root,
    widgetFile(opts.env, opts.customerNumber, guid, 'context.md'),
  );
  const searchesAbs = underRoot(
    root,
    widgetFile(opts.env, opts.customerNumber, guid, 'searches.json'),
  );
  const feedbackAbs = underRoot(
    root,
    widgetFile(opts.env, opts.customerNumber, guid, 'feedback.json'),
  );

  const feedbackBefore = readJsonArray(feedbackAbs);
  const feedbackCountBefore = feedbackBefore.length;

  const existingMd = fs.existsSync(contextAbs)
    ? fs.readFileSync(contextAbs, 'utf8')
    : '';
  const nextMd = foldContextMd(existingMd, feedbackBefore, {
    host: opts.host,
    widgetGuid: guid,
  });
  fs.writeFileSync(contextAbs, nextMd.endsWith('\n') ? nextMd : `${nextMd}\n`, 'utf8');

  const prev = readSearches(searchesAbs);
  const exclude = foldExclude(prev.exclude, feedbackBefore);
  let queries = boundQueries(prev.queries, cap);
  if (!queries.length) {
    queries = defaultSeedQueries(
      { host: opts.host, seedQueries: opts.seedQueries },
      cap,
    );
  } else {
    queries = boundQueries(queries, cap);
  }

  const searchesDoc = { queries, exclude };
  fs.writeFileSync(
    searchesAbs,
    `${JSON.stringify(searchesDoc, null, 2)}\n`,
    'utf8',
  );

  // Fail-when: feedback entries must still be present (never deleted).
  const feedbackAfter = readJsonArray(feedbackAbs);
  if (feedbackAfter.length !== feedbackCountBefore) {
    const err = new Error('feedback_mutated');
    err.code = 'feedback_mutated';
    throw err;
  }
  if (!fs.existsSync(contextAbs)) {
    const err = new Error('context_md_missing');
    err.code = 'context_md_missing';
    throw err;
  }

  return {
    widgetGuid: guid,
    fullTier,
    queryCap: cap,
    contextPath: contextAbs,
    searchesPath: searchesAbs,
    feedbackPath: feedbackAbs,
    feedbackCount: feedbackCountBefore,
    queries: queries.length,
    exclude: exclude.length,
    contextBytes: Buffer.byteLength(nextMd, 'utf8'),
  };
}

module.exports = {
  SEARCH_QUERY_CAP_FREE,
  SEARCH_QUERY_CAP_FULL,
  isFullTier,
  queryCap,
  foldContextMd,
  foldExclude,
  boundQueries,
  defaultSeedQueries,
  runWidgetContextPass,
  readSearches,
  readJsonArray,
};
