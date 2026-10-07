'use strict';

/**
 * Fatal-exception → bobiverse intake (FR-048a).
 * POST https://irc.ntsa.uk/bob/v1/intake with repo SimonBarnett/a-search.
 * Handler wiring is out of scope for FR-048a.
 */

const crypto = require('node:crypto');

const DEFAULT_INTAKE_URL = 'https://irc.ntsa.uk/bob/v1/intake';
const DEFAULT_REPO = 'SimonBarnett/a-search';

/** @type {Set<string>} in-process dedupe of idempotency keys */
const seenKeys = new Set();

/**
 * @param {unknown} value
 * @returns {string}
 */
function redact(value) {
  let text = value == null ? '' : String(value);
  text = text.replace(
    /(Authorization\s*[:=]\s*)(.+)$/gim,
    '$1[REDACTED]',
  );
  text = text.replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]');
  text = text.replace(
    /((?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\s*[:=]\s*)(\S+)/gi,
    '$1[REDACTED]',
  );
  text = text.replace(
    /(Server=.*?;\s*Password=)([^;]+)/gi,
    '$1[REDACTED]',
  );
  return text;
}

/**
 * @param {{ code?: string, message?: string, route?: string, err?: Error & { code?: string } }} parts
 * @returns {string}
 */
function buildIdempotencyKey(parts) {
  const err = parts.err;
  const code =
    parts.code != null
      ? String(parts.code)
      : err && err.code != null
        ? String(err.code)
        : err && err.name
          ? String(err.name)
          : 'Error';
  const message =
    parts.message != null
      ? String(parts.message)
      : err && err.message
        ? String(err.message)
        : '';
  const route = parts.route != null ? String(parts.route) : '';
  const raw = `${code}|${message}|${route}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Build intake JSON body (no network).
 * @param {object} opts
 * @param {Error} [opts.err]
 * @param {string} [opts.route]
 * @param {string} [opts.title]
 * @param {string} [opts.body]
 * @param {string} [opts.repo]
 * @param {string} [opts.kind]
 * @param {string} [opts.source]
 * @param {string} [opts.code]
 * @param {string} [opts.message]
 * @param {string} [opts.idempotencyKey]
 */
function buildIntakePayload(opts = {}) {
  const err = opts.err;
  const repo = opts.repo || DEFAULT_REPO;
  const kind = opts.kind || 'issue';
  const route = opts.route || '';
  const code =
    opts.code != null
      ? String(opts.code)
      : err && err.code != null
        ? String(err.code)
        : err && err.name
          ? String(err.name)
          : 'Error';
  const message =
    opts.message != null
      ? String(opts.message)
      : err && err.message
        ? String(err.message)
        : 'unknown error';
  const titleRaw =
    opts.title ||
    `a-search fatal: ${code}${route ? ` @ ${route}` : ''}`.slice(0, 200);
  const title = redact(titleRaw).slice(0, 200);
  const stack = err && err.stack ? String(err.stack) : '';
  const bodyRaw =
    opts.body ||
    [
      `route: ${route || '(none)'}`,
      `code: ${code}`,
      `message: ${message}`,
      opts.source ? `source: ${opts.source}` : null,
      stack ? `stack:\n${stack}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');
  const body = redact(bodyRaw);
  const idempotency_key =
    opts.idempotencyKey ||
    buildIdempotencyKey({ code, message, route, err });
  return {
    kind,
    repo,
    title,
    body,
    idempotency_key,
  };
}

/**
 * POST fatal exception to intake. Inject `fetch` for tests.
 * Same idempotency_key in-process skips a second network call.
 *
 * @param {object} opts
 * @param {Error} [opts.err]
 * @param {string} [opts.route]
 * @param {string} [opts.source]
 * @param {string} [opts.intakeUrl]
 * @param {typeof fetch} [opts.fetch]
 * @param {boolean} [opts.force] - bypass in-process dedupe
 * @returns {Promise<{ ok: boolean, skipped?: boolean, status?: number, payload: object, responseText?: string }>}
 */
async function reportException(opts = {}) {
  const payload = buildIntakePayload(opts);
  const intakeUrl = opts.intakeUrl || DEFAULT_INTAKE_URL;
  const fetchImpl =
    opts.fetch ||
    (typeof fetch === 'function' ? fetch.bind(globalThis) : null);

  if (!opts.force && seenKeys.has(payload.idempotency_key)) {
    return { ok: true, skipped: true, payload };
  }

  if (!fetchImpl) {
    const err = new Error('fetch is not available; inject opts.fetch');
    err.code = 'intake_fetch_missing';
    throw err;
  }

  const res = await fetchImpl(intakeUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const status = res && typeof res.status === 'number' ? res.status : 0;
  const responseText =
    res && typeof res.text === 'function' ? await res.text() : '';
  seenKeys.add(payload.idempotency_key);
  return {
    ok: status >= 200 && status < 300,
    status,
    payload,
    responseText,
  };
}

/** Test helper: clear in-process dedupe. */
function clearReportExceptionDedupe() {
  seenKeys.clear();
}

module.exports = {
  reportException,
  buildIntakePayload,
  buildIdempotencyKey,
  redact,
  clearReportExceptionDedupe,
  DEFAULT_INTAKE_URL,
  DEFAULT_REPO,
};
