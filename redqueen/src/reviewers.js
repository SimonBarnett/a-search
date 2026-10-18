'use strict';

/**
 * FR #4098: real reviewers --- Grok first, Cursor only when Grok is exhausted.
 * Stub / unavailable reviews must never mark folders annotated (caller checks).
 */

const { spawnSync } = require('node:child_process');

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
function tryGrokCli(opts) {
  const bin = process.env.A_SEARCH_GROK_BIN || 'grok';
  const timeoutMs = opts.timeoutMs == null ? 120000 : opts.timeoutMs;
  try {
    const r = spawnSync(
      bin,
      ['--prompt', opts.prompt, '--output', 'text'],
      {
        encoding: 'utf8',
        timeout: timeoutMs,
        env: { ...process.env, ...(opts.env || {}) },
        windowsHide: true,
      },
    );
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
      return { ok: false, detail: `grok_exit_${r.status}` };
    }
    const text = String(r.stdout || '').trim();
    if (!text) return { ok: false, detail: 'grok_empty' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, detail: `grok_throw:${(err && err.message) || err}` };
  }
}

/**
 * @param {{ prompt: string, timeoutMs?: number, env?: NodeJS.ProcessEnv }} opts
 * @returns {{ ok: boolean, text?: string, detail?: string }}
 */
function tryCursorCli(opts) {
  const bin = process.env.A_SEARCH_CURSOR_BIN || 'agent';
  const timeoutMs = opts.timeoutMs == null ? 180000 : opts.timeoutMs;
  try {
    const r = spawnSync(
      bin,
      ['-p', opts.prompt, '--output-format', 'text'],
      {
        encoding: 'utf8',
        timeout: timeoutMs,
        env: { ...process.env, ...(opts.env || {}) },
        windowsHide: true,
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
      return { ok: false, detail: `cursor_exit_${r.status}` };
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
  const trimmed = String(text || '').trim();
  try {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const obj = JSON.parse(trimmed.slice(start, end + 1));
      if (obj && typeof obj === 'object') {
        return { ...obj, model: obj.model || model, usable: true };
      }
    }
  } catch {
    // fall through
  }
  return {
    summary: trimmed.slice(0, 4000),
    model,
    usable: true,
  };
}

/**
 * @param {{
 *   kind: 'host'|'guid',
 *   host: string,
 *   hostkey: string,
 *   guid?: string,
 *   uri?: string,
 *   hostAnnotations?: object,
 *   tryGrok?: Function,
 *   tryCursor?: Function,
 * }} input
 */
async function reviewWithGrokThenCursor(input) {
  const tryGrok = input.tryGrok || tryGrokCli;
  const tryCursor = input.tryCursor || tryCursorCli;
  const prompt =
    input.kind === 'host'
      ? [
          'Review this a-clubs host site for parts/search annotation.',
          `host=${input.host}`,
          `hostkey=${input.hostkey}`,
          'Return JSON: {summary, categories[], notes}',
        ].join('\n')
      : [
          'Review this a-clubs GUID page for parts/search annotation.',
          `host=${input.host}`,
          `hostkey=${input.hostkey}`,
          `guid=${input.guid}`,
          `uri=${input.uri || ''}`,
          `hostAnnotations=${JSON.stringify(input.hostAnnotations || {}).slice(0, 2000)}`,
          'Return JSON: {summary, intent, suggestedQueries[], steering?}',
        ].join('\n');

  const grok = tryGrok({ prompt });
  if (grok.ok) {
    return coerceReview(grok.text, 'grok');
  }
  if (grok.detail === 'grok_exhausted' || grok.detail === 'grok_not_found') {
    const cursor = tryCursor({ prompt });
    if (cursor.ok) {
      return coerceReview(cursor.text, 'cursor');
    }
    return {
      model: 'stub',
      usable: false,
      unavailable: true,
      detail: `grok:${grok.detail};cursor:${cursor.detail}`,
      summary: '',
    };
  }
  // Other grok failures: still try Cursor once (standing rule: Cursor when Grok exhausted;
  // also when Grok binary missing already handled; for exit errors try Cursor as fallback).
  const cursor = tryCursor({ prompt });
  if (cursor.ok) {
    return coerceReview(cursor.text, 'cursor');
  }
  return {
    model: 'stub',
    usable: false,
    unavailable: true,
    detail: `grok:${grok.detail};cursor:${cursor.detail}`,
    summary: '',
  };
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
  reviewWithGrokThenCursor,
  defaultReviewHost,
  defaultReviewGuid,
  coerceReview,
};
