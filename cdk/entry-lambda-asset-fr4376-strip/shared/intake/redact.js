'use strict';

/**
 * Redact secrets from intake exception bodies (FR-048b).
 * Never leave bearer tokens, passwords, or connection-string secrets in POST body.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function redactSecrets(value) {
  let text = value == null ? '' : String(value);

  // Authorization header / field (rest of line)
  text = text.replace(/(Authorization\s*[:=]\s*)(.+)$/gim, '$1[REDACTED]');
  text = text.replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]');

  // JWT-looking blobs
  text = text.replace(
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    '[REDACTED_JWT]',
  );

  // Key=value style secrets
  text = text.replace(
    /((?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|secret[_-]?access[_-]?key|client[_-]?secret|refresh[_-]?token)\s*[:=]\s*)(\S+)/gi,
    '$1[REDACTED]',
  );

  // ADO.NET / ODBC-style connection strings
  text = text.replace(
    /((?:Password|Pwd|User ID|UID)\s*=\s*)([^;]+)/gi,
    '$1[REDACTED]',
  );

  // AWS access key id pattern (AKIA…)
  text = text.replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]');

  return text;
}

/** @deprecated use redactSecrets — kept as alias for reportException */
const redact = redactSecrets;

module.exports = { redactSecrets, redact };
