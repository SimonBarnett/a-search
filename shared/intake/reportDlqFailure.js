'use strict';

/**
 * FR #5222: when a provider (or SQL) message is dead-lettered, file one a-search
 * review issue via bobiverse intake. Fail-soft. File at send / final-receive;
 * do not consume, empty, or redrive a dead-letter queue from this module.
 * Dedupe: sha256(searchid|provider) normally; known gates group by provider|code.
 */

const crypto = require('node:crypto');
const { redact, redactSecrets } = require('./redact');
const {
  reportException,
  resolveIntakeUrl,
  clearReportExceptionDedupe,
  DEFAULT_REPO,
} = require('./reportException');

/** Codes that share one open issue (counter comments) instead of one per search. */
const GROUPED_CODES = new Set(['creators_not_eligible']);

/** @type {Set<string>} */
const seenFp = new Set();

/**
 * Unit / hostile fixtures must never POST to live intake (class of #5227-#5232).
 * Detect example.* / *.test hosts and sqs.example (or bare https://sqs/) queue URLs.
 * @param {object} opts
 * @returns {boolean}
 */
function isTestFixtureDlqContext(opts = {}) {
  const host = String(opts.host || '').trim().toLowerCase();
  const queue = String(opts.queueUrl || opts.dlqUrl || '').trim().toLowerCase();
  if (host) {
    if (
      host === 'example.test' ||
      host.endsWith('.example') ||
      host.includes('.example.') ||
      host.endsWith('.test') ||
      host.includes('example-club') ||
      host.includes('mrb4923') ||
      host.includes('mrb4785')
    ) {
      return true;
    }
  }
  if (queue) {
    if (
      queue.includes('sqs.example') ||
      queue.includes('example.test') ||
      /^https?:\/\/sqs(\/|$)/.test(queue)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function faultCode(err) {
  if (!err || typeof err !== 'object') return 'provider_error';
  const code = /** @type {{ code?: string, name?: string }} */ (err).code;
  if (code != null && String(code).trim()) return String(code).trim();
  const name = /** @type {{ name?: string }} */ (err).name;
  return name ? String(name) : 'provider_error';
}

/**
 * @param {object} msg
 * @returns {string}
 */
function searchidFromMsg(msg) {
  if (!msg || typeof msg !== 'object') return '';
  return String(msg.searchid || msg.searchId || '').trim();
}

/**
 * @param {object} opts
 * @returns {string}
 */
function dlqFingerprint(opts) {
  const provider = String(opts.provider || opts.source || 'unknown')
    .trim()
    .toLowerCase() || 'unknown';
  const code = String(opts.code || 'provider_error').trim() || 'provider_error';
  const searchid = String(opts.searchid || '').trim() || 'unknown';
  const raw = GROUPED_CODES.has(code)
    ? `${provider}|${code}|grouped`
    : `${searchid}|${provider}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * @param {object} opts
 * @returns {string}
 */
function buildDlqIssueTitle(opts) {
  const provider = String(opts.provider || 'unknown').trim() || 'unknown';
  const code = String(opts.code || 'provider_error').trim() || 'provider_error';
  const searchid = String(opts.searchid || '').trim();
  const grouped = GROUPED_CODES.has(code);
  const base = grouped
    ? `DLQ review: ${provider} ${code} (grouped)`
    : `DLQ review: ${provider} ${searchid || 'unknown'} (${code})`;
  return redact(base).slice(0, 200);
}

/**
 * @param {object} opts
 * @returns {string}
 */
function buildDlqIssueBody(opts) {
  const fp = opts.fingerprint || dlqFingerprint(opts);
  const provider = String(opts.provider || 'unknown').trim() || 'unknown';
  const code = String(opts.code || 'provider_error').trim() || 'provider_error';
  const searchid = String(opts.searchid || '').trim() || 'unknown';
  const host = String(opts.host || '').trim();
  const guid = String(opts.guid || '').trim();
  const queueUrl = String(opts.queueUrl || '').trim();
  const dlqUrl = String(opts.dlqUrl || '').trim();
  const path = GROUPED_CODES.has(code) ? 'grouped_known_cause' : String(opts.path || 'immediate');
  const receiveCount =
    Number.isFinite(Number(opts.receiveCount)) && Number(opts.receiveCount) > 0
      ? Math.floor(Number(opts.receiveCount))
      : 0;
  const ts = opts.timestampGmt || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const queries = Array.isArray(opts.queries)
    ? opts.queries
    : opts.q != null
      ? [opts.q]
      : [];
  const queryLines = queries
    .slice(0, 8)
    .map((q) => `- \`${redactSecrets(String(q)).slice(0, 200)}\``)
    .join('\n');
  const errMsg = redactSecrets(
    String((opts.err && opts.err.message) || opts.message || '').slice(0, 500),
  );
  const logHint =
    opts.logInsightsHint ||
    'CloudWatch Logs Insights: filter @logStream like /a-search/ and searchid=' +
      searchid;
  const lines = [
    `<!-- dlq-fp:${fp} -->`,
    '',
    '## Provider DLQ review (FR #5222)',
    '',
    `- **Provider/source:** \`${provider}\``,
    `- **Main queue:** \`${redactSecrets(queueUrl) || '(unknown)'}\``,
    `- **DLQ:** \`${redactSecrets(dlqUrl) || '(unknown)'}\``,
    host ? `- **Host:** \`${redactSecrets(host)}\`` : null,
    guid ? `- **GUID:** \`${redactSecrets(guid)}\`` : null,
    host && guid
      ? `- **a-clubs path:** \`a-clubs/${redactSecrets(host)}/${redactSecrets(guid)}/\``
      : null,
    `- **searchid:** \`${redactSecrets(searchid)}\``,
    `- **Failure code:** \`${redactSecrets(code)}\``,
    `- **Path:** \`${path}\` (immediate | maxReceiveCount | grouped_known_cause)`,
    `- **ApproximateReceiveCount:** ${receiveCount}`,
    `- **Timestamp (GMT):** ${ts}`,
    '',
    '### Search / queries (redacted)',
    '',
    queryLines || '- (none in message)',
    '',
    '### Last error (redacted)',
    '',
    '```',
    errMsg || '(none)',
    '```',
    '',
    '### CloudWatch',
    '',
    redactSecrets(logHint),
    '',
    '**Do not redrive or empty the DLQ without Simon.** Filing is fail-soft and must not consume DLQ messages.',
  ].filter((x) => x != null);
  return lines.join('\n');
}

/**
 * File (or dedupe-skip) a DLQ review issue. Never throws to caller.
 * @param {object} opts
 * @returns {Promise<object>}
 */
async function reportDlqFailure(opts = {}) {
  try {
    const msg = opts.msg && typeof opts.msg === 'object' ? opts.msg : {};
    const provider = String(
      opts.provider || opts.source || msg.source || 'unknown',
    )
      .trim()
      .toLowerCase() || 'unknown';
    const code = String(opts.code || faultCode(opts.err) || 'provider_error').trim();
    const searchid = String(opts.searchid || searchidFromMsg(msg) || '').trim();
    const host = String(
      opts.host || msg.hostkey || msg.host || '',
    ).trim();
    const guid = String(opts.guid || msg.guid || msg.widgetGuid || '').trim();
    const queueUrl = String(opts.queueUrl || '').trim();
    const dlqUrl = String(opts.dlqUrl || '').trim();
    const queries =
      opts.queries ||
      msg.queries ||
      (msg.q != null ? [msg.q] : undefined);
    const fingerprint = dlqFingerprint({
      provider,
      code,
      searchid,
    });
    if (!opts.force && seenFp.has(fingerprint)) {
      return { ok: true, skipped: true, fingerprint, reason: 'in_process_dedupe' };
    }
    // FR #5232: never POST fixture DLQs to live intake when fetch/intakeUrl omitted.
    if (
      !opts.force &&
      isTestFixtureDlqContext({ host, queueUrl, dlqUrl }) &&
      !opts.fetch &&
      !opts.intakeUrl
    ) {
      return {
        ok: true,
        skipped: true,
        fingerprint,
        reason: 'test_fixture_no_intake',
      };
    }
    const title = buildDlqIssueTitle({ provider, code, searchid });
    const body = buildDlqIssueBody({
      ...opts,
      fingerprint,
      provider,
      code,
      searchid,
      host,
      guid,
      queries,
      q: msg.q,
    });
    const result = await reportException({
      title,
      body,
      kind: 'issue',
      repo: opts.repo || DEFAULT_REPO,
      route: opts.route || `dlq/${provider}`,
      source: provider,
      code,
      message: opts.err && opts.err.message ? String(opts.err.message) : code,
      err: opts.err,
      idempotencyKey: fingerprint,
      intakeUrl: opts.intakeUrl,
      fetch: opts.fetch,
      force: opts.force,
    });
    seenFp.add(fingerprint);
    return { ...result, fingerprint };
  } catch (e) {
    const detail = e && e.message ? String(e.message) : String(e);
    const log =
      typeof opts.logError === 'function'
        ? opts.logError
        : console.error.bind(console);
    log(
      '[a-search]',
      'WARN',
      'dlq_issue_report_failed',
      detail.slice(0, 300),
    );
    return { ok: false, error: detail.slice(0, 300) };
  }
}

function clearDlqFailureDedupe() {
  seenFp.clear();
  clearReportExceptionDedupe();
}

module.exports = {
  reportDlqFailure,
  dlqFingerprint,
  buildDlqIssueTitle,
  buildDlqIssueBody,
  faultCode,
  GROUPED_CODES,
  isTestFixtureDlqContext,
  clearDlqFailureDedupe,
};
