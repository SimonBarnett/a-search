'use strict';

/**
 * FR #4098 / #4147: real reviewers --- Grok first, Cursor when Grok exhausted.
 * FR #4223: grok 1.0.62 flags are -p / --prompt-file and --output-format plain.
 * FR #4240 / #4231: LocalSystem can use grok when GROK_HOME is a dedicated folder
 * ACL'd to SYSTEM (Admin ~/.grok returns Access is denied). Installer -GrokHome
 * sets USERPROFILE/HOME/GROK_HOME; -Credential remains an alternative. Spawn
 * inherits the service account profile / GROK_HOME.
 * Reviewers require fetched pageText (FR #4147); stub/unavailable never annotate.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const {
  HOST_SCHEMA,
  PAGE_SCHEMA,
  HOST_SKELETON,
  PAGE_SKELETON,
  parseReviewJson,
  validateHostAnnotation,
  validatePageAnnotation,
  liftHostReview,
  liftPageReview,
} = require('./annotationSchemas');

/** FR #4236: grok review must not block the event loop (spawnSync starved S3/SQS). */
const REVIEWER_TIMEOUT_MS = 120000;

/**
 * Async spawn that collects stdout/stderr and kills the process tree on timeout.
 * @param {string} exe
 * @param {string[]} args
 * @param {{ timeout: number, env?: NodeJS.ProcessEnv, windowsHide?: boolean, shell?: boolean }} opts
 */
function spawnCollect(exe, args, opts) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(exe, args, {
        env: opts.env,
        windowsHide: opts.windowsHide !== false,
        shell: Boolean(opts.shell),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({ status: null, stdout: '', stderr: '', error });
      return;
    }
    let stdout = '';
    let stderr = '';
    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d) => {
        stdout += d;
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (d) => {
        stderr += d;
      });
    }
    let settled = false;
    const finish = (status, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, stdout, stderr, error });
    };
    const timer = setTimeout(() => {
      try {
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        } else {
          child.kill();
        }
      } catch {
        /* ignore */
      }
      const error = new Error('timeout');
      error.code = 'ETIMEDOUT';
      finish(null, error);
    }, opts.timeout);
    child.on('error', (error) => finish(null, error));
    child.on('close', (code) => finish(code, null));
  });
}

/** FR #4223: grok 1.0.62 uses -p / --prompt-file, not --prompt. */
const GROK_PROMPT_FILE_CHARS = 4000;

/**
 * Argv grok 1.0.62 accepts. Pass promptFile for long prompts (Windows cmdline limit).
 * @param {string} prompt
 * @param {string} [promptFile]
 * @returns {string[]}
 */
function grokReviewArgv(prompt, promptFile) {
  const tail = ['--output-format', 'plain', '--disable-web-search'];
  if (promptFile) return ['--prompt-file', promptFile, ...tail];
  return ['-p', prompt, ...tail];
}

/**
 * First stderr line, secrets stripped, for grok_exit_N detail.
 * @param {string} stderr
 */
function firstCliErrorLine(stderr) {
  const line = String(stderr || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean);
  if (!line) return '';
  return line
    .replace(
      /(api[_-]?key|token|password|secret|bearer)\s*[:=]\s*\S+/gi,
      '$1=***',
    )
    .slice(0, 180);
}

/**
 * redqueen ships agent.exe as the Grok Build binary under .grok\\bin.
 * @param {string} bin
 */
function cursorBinLooksLikeGrok(bin) {
  const norm = String(bin || '')
    .replace(/\//g, '\\')
    .toLowerCase();
  if (/\.grok\\bin\\agent(\.exe)?$/.test(norm)) return true;
  const grok = String(process.env.A_SEARCH_GROK_BIN || '')
    .replace(/\//g, '\\')
    .toLowerCase();
  if (grok && norm === grok) return true;
  return false;
}

/**
 * @param {unknown} review
 * @returns {boolean}
 */
function isUsableReview(review) {
  if (!review || typeof review !== 'object') return false;
  if (review.usable === false) return false;
  if (review.unavailable === true) return false;
  const model = String(review.model || '').toLowerCase();
  if (!model || model === 'stub') return false;
  return true;
}

/**
 * @param {{ prompt: string, timeoutMs?: number, env?: NodeJS.ProcessEnv }} opts
 * @returns {{ ok: boolean, text?: string, detail?: string }}
 */
async function tryGrokCli(opts) {
  const bin = process.env.A_SEARCH_GROK_BIN || 'grok';
  const timeoutMs = opts.timeoutMs == null ? REVIEWER_TIMEOUT_MS : opts.timeoutMs;
  const prompt = String(opts.prompt || '');
  let promptFile = null;
  const useFile = prompt.length > GROK_PROMPT_FILE_CHARS;
  if (useFile) {
    promptFile = path.join(
      os.tmpdir(),
      `a-search-grok-prompt-${process.pid}-${Date.now()}.txt`,
    );
    fs.writeFileSync(promptFile, prompt, 'utf8');
  }
  const argv = grokReviewArgv(prompt, promptFile);
  const nodeScript = process.env.A_SEARCH_GROK_NODE_SCRIPT;
  const exe = nodeScript ? process.execPath : bin;
  const spawnArgv = nodeScript ? [nodeScript, ...argv] : argv;
  try {
    const r = await spawnCollect(exe, spawnArgv, {
      timeout: timeoutMs,
      env: { ...process.env, ...(opts.env || {}) },
      windowsHide: true,
    });
    if (r.error) {
      const code = r.error.code || '';
      if (code === 'ENOENT') {
        return { ok: false, detail: 'grok_not_found' };
      }
      return { ok: false, detail: `grok_error:${r.error.message}` };
    }
    if (r.status !== 0) {
      const errText = String(r.stderr || r.stdout || '').toLowerCase();
      if (/token|quota|exhausted|rate.?limit|402|429/.test(errText)) {
        return { ok: false, detail: 'grok_exhausted' };
      }
      const line = firstCliErrorLine(r.stderr);
      return {
        ok: false,
        detail: line ? `grok_exit_${r.status}:${line}` : `grok_exit_${r.status}`,
      };
    }
    const text = String(r.stdout || '').trim();
    if (!text) return { ok: false, detail: 'grok_empty' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, detail: `grok_throw:${(err && err.message) || err}` };
  } finally {
    if (promptFile) {
      try {
        fs.unlinkSync(promptFile);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * @param {{ prompt: string, timeoutMs?: number, env?: NodeJS.ProcessEnv }} opts
 * @returns {{ ok: boolean, text?: string, detail?: string }}
 */
async function tryCursorCli(opts) {
  let bin = process.env.A_SEARCH_CURSOR_BIN || 'agent';
  if (!/[\\/]/.test(bin) && process.platform === 'win32') {
    const w = spawnSync('where.exe', [bin], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
    });
    if (w.status === 0) {
      const first = String(w.stdout || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find(Boolean);
      if (first) bin = first;
    }
  }
  if (cursorBinLooksLikeGrok(bin)) {
    return { ok: false, detail: 'cursor_is_grok_bin' };
  }
  const timeoutMs = opts.timeoutMs == null ? 180000 : opts.timeoutMs;
  // Real Cursor agent on Windows is often agent.cmd (needs a shell); .exe does not.
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
  try {
    const r = await spawnCollect(
      bin,
      ['-p', opts.prompt, '--output-format', 'text'],
      {
        timeout: timeoutMs,
        env: { ...process.env, ...(opts.env || {}) },
        windowsHide: true,
        shell: useShell,
      },
    );
    if (r.error) {
      const code = r.error.code || '';
      if (code === 'ENOENT') {
        return { ok: false, detail: 'cursor_not_found' };
      }
      return { ok: false, detail: `cursor_error:${r.error.message}` };
    }
    if (r.status !== 0) {
      const line = firstCliErrorLine(r.stderr);
      return {
        ok: false,
        detail: line
          ? `cursor_exit_${r.status}:${line}`
          : `cursor_exit_${r.status}`,
      };
    }
    const text = String(r.stdout || '').trim();
    if (!text) return { ok: false, detail: 'cursor_empty' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, detail: `cursor_throw:${(err && err.message) || err}` };
  }
}

/**
 * Parse loose JSON from model text, or wrap as summary.
 * @param {string} text
 * @param {string} model
 */
function coerceReview(text, model) {
  const parsed = parseReviewJson(text);
  if (!parsed.ok) {
    return {
      model,
      usable: false,
      schema_invalid: true,
      detail: 'not_json',
      errors: parsed.errors,
      summary: '',
    };
  }
  return { ...parsed.value, model: parsed.value.model || model, usable: true };
}

/** FR #4251: page summary this close to the host brief is a copy, not a page review. */
const PAGE_HOST_SIMILARITY_MAX = 0.72;

function reviewTokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/**
 * Jaccard similarity. Exact or contained copies count as too similar.
 * @param {string} pageText
 * @param {string} hostText
 */
function annotationSimilarity(pageText, hostText) {
  const a = String(pageText || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const b = String(hostText || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length > 40 && (b.includes(a) || a.includes(b))) return 0.95;
  const ta = reviewTokens(a);
  const tb = reviewTokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  return inter / (ta.size + tb.size - inter);
}

function annotationsTooSimilar(pageText, hostText) {
  return annotationSimilarity(pageText, hostText) >= PAGE_HOST_SIMILARITY_MAX;
}

function hostBriefText(hostAnnotations) {
  const h = hostAnnotations || {};
  return [h.summary, h.club, h.audience, h.affiliateOpportunities, h.notes]
    .filter(Boolean)
    .join('\n');
}

function formatHead(head) {
  const h = head || {};
  const og = h.og && typeof h.og === 'object' ? h.og : {};
  const ogLines = Object.keys(og)
    .sort()
    .map((k) => `${k}=${og[k]}`);
  return [
    `title=${h.title || ''}`,
    `description=${h.description || ''}`,
    `keywords=${h.keywords || ''}`,
    ...ogLines,
  ].join('\n');
}

function isNarrationSummary(summary) {
  return /\b(i'll|i will|i am going to|i'm going to|let me)\b/i.test(String(summary || ''));
}

function isCompleteHostBrief(review) {
  if (!review || typeof review !== 'object') return false;
  if (isNarrationSummary(review.summary) || isNarrationSummary(review.about)) return false;
  if (review.schema === HOST_SCHEMA) return validateHostAnnotation(review).ok;
  const club = String(review.club || '').trim();
  const audience =
    typeof review.audience === 'string'
      ? review.audience.trim()
      : String((review.audience && review.audience.summary) || '').trim();
  const aff =
    typeof review.affiliateOpportunities === 'string'
      ? review.affiliateOpportunities.trim()
      : Array.isArray(review.affiliate_opportunities) && review.affiliate_opportunities.length
        ? 'ok'
        : '';
  if (!club || !audience || !aff) return false;
  return true;
}

function isCompleteGuidReview(review) {
  if (!review || typeof review !== 'object') return false;
  if (review.schema === PAGE_SCHEMA) return validatePageAnnotation(review).ok;
  const summary = String(review.summary || review.page_purpose || '').trim();
  if (!summary || isNarrationSummary(summary)) return false;
  const steering = review.steering || review.selection;
  if (steering == null) return false;
  if (typeof steering === 'string') return steering.trim().length > 0;
  if (typeof steering === 'object') return Object.keys(steering).length > 0;
  return false;
}

function formatExtraPages(pages) {
  const list = Array.isArray(pages) ? pages : [];
  if (!list.length) return '(none)';
  return list
    .map((p, i) => {
      const text = String((p && p.text) || '').slice(0, 4000);
      return [`#${i + 1} url=${(p && p.url) || ''}`, `title=${(p && p.title) || ''}`, text].join('\n');
    })
    .join('\n---\n');
}

/**
 * @param {object} input
 */
function hostReviewPrompt(input) {
  const pageSlice = String(input.pageText || '').trim().slice(0, 12000);
  return [
    'Answer in one shot from the supplied text only. Do not browse, do not open other pages, and do not say what you will do next.',
    'Write an affiliate-targeting brief of this CLUB. Do not restate the home page.',
    'Club specifics: what the club is and does, its discipline or niche, size or activity if visible, location or region, and governing-body affiliation.',
    'Audience: who the members and visitors are, and what they buy or need.',
    'Affiliate opportunities: product categories, brands and retailers that fit this audience, existing shop or affiliate activity, gaps where products could be offered, and seasonal or event hooks.',
    'club, audience and affiliateOpportunities must be non-empty. summary must be the brief, not a plan to fetch more pages.',
    `host=${input.host}`,
    `hostkey=${input.hostkey}`,
    `pageUrl=${input.pageUrl || ''}`,
    'HEAD_META_BEGIN',
    formatHead(input.pageHead),
    'HEAD_META_END',
    'PAGE_TEXT_BEGIN',
    pageSlice,
    'PAGE_TEXT_END',
    'EXTRA_PAGES_BEGIN',
    formatExtraPages(input.extraPages),
    'EXTRA_PAGES_END',
    'Return only this JSON object (aclubs.host.v1). No prose. Fill every required field.',
    'about 40-600 chars: club niche, region, governing body. No addresses, hours or site credits.',
    'description 40-400 chars: site-wide affiliate targeting. keywords 5-20. exclusions: product types that never fit.',
    'identity_terms: club names, aliases, town, postcode — denylist for page fields, never searches.',
    'market must be ISO codes only (country GB, currency GBP, locale en-GB). Never free-text market.',
    JSON.stringify(HOST_SKELETON),
  ].join('\n');
}

/**
 * @param {object} input
 */
function guidReviewPrompt(input) {
  const pageSlice = String(input.pageText || '').trim().slice(0, 12000);
  const hostJson = JSON.stringify(input.hostAnnotations || {}).slice(0, 4000);
  return [
    'Answer in one shot from the supplied text only. Do not browse, fetch URLs, or use tools.',
    'Describe ONLY this page. The host review is context. Do not repeat the host review.',
    'Use the page title, meta description, meta keywords, og tags, and H1/H2 to say how THIS page narrows search beyond the club.',
    'steering must list concrete narrowing signals from this page: title and meta terms, categories, price band, include terms, exclude terms, plus market, currency and locale. Keep market/currency/locale out of search_queries[].q (FR #5290 / #5041).',
    `host=${input.host}`,
    `hostkey=${input.hostkey}`,
    `guid=${input.guid}`,
    `uri=${input.uri || ''}`,
    `pageUrl=${input.pageUrl || ''}`,
    'HOST_REVIEW_BEGIN',
    hostJson,
    'HOST_REVIEW_END',
    'HEAD_META_BEGIN',
    formatHead(input.pageHead),
    'HEAD_META_END',
    'PAGE_TEXT_BEGIN',
    pageSlice,
    'PAGE_TEXT_END',
    'Return only this JSON object (aclubs.page.v1). No prose. Fill every required field.',
    'Describe ONLY this URI. Do not copy host about, keywords, exclusions or identity_terms.',
    'page_purpose/page_description must be what this page covers that other site pages do not.',
    'search_queries[].q is keyword-only: no location, market, currency or club identity.',
    'FR #5290: lead with GENERIC category/part terms a broad catalogue can match (e.g. RC plane, RTF trainer, RC aircraft battery, paint station, servo, propeller). Put those rows first. Specific brand/model/sku rows may follow as extras (structured brand/model/sku per FR #5281). At least one search_queries row must have no model and no sku.',
    'File enough search_queries for a reasonable chance of relevant parts: generic product type/part terms first, then brand/model and close alternatives (FR #5047 / #5290). 0 results is still a valid outcome (need more vendors in that sector); providers never widen matches to fill a page.',
    'selection is the IN/ parts-selection brief for this GUID only.',
    JSON.stringify(PAGE_SKELETON),
  ].join('\n');
}

/**
 * @param {{
 *   kind: 'host'|'guid',
 *   host: string,
 *   hostkey: string,
 *   guid?: string,
 *   uri?: string,
 *   hostAnnotations?: object,
 *   pageHead?: object,
 *   tryGrok?: Function,
 *   tryCursor?: Function,
 * }} input
 */
async function reviewWithGrokThenCursor(input) {
  const tryGrok = input.tryGrok || tryGrokCli;
  const tryCursor = input.tryCursor || tryCursorCli;
  const pageText = String(input.pageText || '').trim();
  const headSignal = String(
    (input.pageHead && (input.pageHead.title || input.pageHead.description)) || '',
  ).trim();
  if (!pageText && !headSignal) {
    return {
      model: 'stub',
      usable: false,
      unavailable: true,
      detail: 'page_text_required',
      summary: '',
    };
  }
  const basePrompt = input.kind === 'host' ? hostReviewPrompt(input) : guidReviewPrompt(input);

  async function runOnce(prompt) {
    const grok = await Promise.resolve(tryGrok({ prompt }));
    if (grok.ok) return coerceReview(grok.text, 'grok');
    if (grok.detail === 'grok_exhausted' || grok.detail === 'grok_not_found') {
      const cursor = await Promise.resolve(tryCursor({ prompt }));
      if (cursor.ok) return coerceReview(cursor.text, 'cursor');
      return {
        model: 'stub',
        usable: false,
        unavailable: true,
        detail: `grok:${grok.detail};cursor:${cursor.detail}`,
        summary: '',
      };
    }
    const cursor = await Promise.resolve(tryCursor({ prompt }));
    if (cursor.ok) return coerceReview(cursor.text, 'cursor');
    return {
      model: 'stub',
      usable: false,
      unavailable: true,
      detail: `grok:${grok.detail};cursor:${cursor.detail}`,
      summary: '',
    };
  }

  function schemaErrors(review) {
    if (!review || review.usable === false) {
      return review && review.errors ? review.errors : ['unusable'];
    }
    if (input.kind === 'host') {
      const lifted = liftHostReview(review, { host: input.host });
      return validateHostAnnotation(lifted).errors;
    }
    const lifted = liftPageReview(review, {
      guid: input.guid,
      uri: input.uri || '/',
      pageHead: input.pageHead,
    });
    return validatePageAnnotation(lifted).errors;
  }

  let review = await runOnce(basePrompt);
  let errs = schemaErrors(review);
  if (errs.length) {
    review = await runOnce(
      `${basePrompt}\nVALIDATOR_ERRORS_BEGIN\n${errs.join('\n')}\nVALIDATOR_ERRORS_END\nReturn only valid JSON.`,
    );
    errs = schemaErrors(review);
    if (errs.length && review && review.usable) {
      review = {
        ...review,
        usable: false,
        schema_invalid: true,
        errors: errs,
        detail: input.kind === 'host' ? 'host_schema_invalid' : 'page_schema_invalid',
      };
    }
  }
  return review;
}

async function defaultReviewHost(input) {
  return reviewWithGrokThenCursor({ ...input, kind: 'host' });
}

async function defaultReviewGuid(input) {
  return reviewWithGrokThenCursor({ ...input, kind: 'guid' });
}

module.exports = {
  isUsableReview,
  tryGrokCli,
  tryCursorCli,
  grokReviewArgv,
  cursorBinLooksLikeGrok,
  REVIEWER_TIMEOUT_MS,
  spawnCollect,
  reviewWithGrokThenCursor,
  hostReviewPrompt,
  guidReviewPrompt,
  annotationSimilarity,
  annotationsTooSimilar,
  hostBriefText,
  isNarrationSummary,
  isCompleteHostBrief,
  isCompleteGuidReview,
  PAGE_HOST_SIMILARITY_MAX,
  defaultReviewHost,
  defaultReviewGuid,
  coerceReview,
  HOST_SCHEMA,
  PAGE_SCHEMA,
};
