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
  const pageText = String(input.pageText || '').trim();
  if (!pageText) {
    return {
      model: 'stub',
      usable: false,
      unavailable: true,
      detail: 'page_text_required',
      summary: '',
    };
  }
  const pageSlice = pageText.slice(0, 12000);
  const prompt =
    input.kind === 'host'
      ? [
          'Review this a-clubs host site for parts/search annotation.',
          `host=${input.host}`,
          `hostkey=${input.hostkey}`,
          `pageUrl=${input.pageUrl || ''}`,
          'PAGE_TEXT_BEGIN',
          pageSlice,
          'PAGE_TEXT_END',
          'Return JSON: {summary, categories[], notes}',
        ].join('\n')
      : [
          'Review this a-clubs GUID page for parts/search annotation.',
          `host=${input.host}`,
          `hostkey=${input.hostkey}`,
          `guid=${input.guid}`,
          `uri=${input.uri || ''}`,
          `pageUrl=${input.pageUrl || ''}`,
          `hostAnnotations=${JSON.stringify(input.hostAnnotations || {}).slice(0, 2000)}`,
          'PAGE_TEXT_BEGIN',
          pageSlice,
          'PAGE_TEXT_END',
          'Return JSON: {summary, intent, suggestedQueries[], steering?}',
        ].join('\n');

  const grok = await Promise.resolve(tryGrok({ prompt }));
  if (grok.ok) {
    return coerceReview(grok.text, 'grok');
  }
  if (grok.detail === 'grok_exhausted' || grok.detail === 'grok_not_found') {
    const cursor = await Promise.resolve(tryCursor({ prompt }));
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
  const cursor = await Promise.resolve(tryCursor({ prompt }));
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
  grokReviewArgv,
  cursorBinLooksLikeGrok,
  REVIEWER_TIMEOUT_MS,
  spawnCollect,
  reviewWithGrokThenCursor,
  defaultReviewHost,
  defaultReviewGuid,
  coerceReview,
};
