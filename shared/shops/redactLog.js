'use strict';

/**
 * FR-235: redact shop credential keys from log lines (token|secret|key|password).
 * Composes with shared/intake/redact.js patterns.
 */

const { redactSecrets } = require('../intake/redact');

/**
 * @param {unknown} value
 * @returns {string}
 */
function redactShopSecrets(value) {
  let text = redactSecrets(value);
  // JSON "access_token":"..." style
  text = text.replace(
    /("?(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|api[_-]?token|password|passwd|pwd|secret|token)"?\s*[:=]\s*)("?)[^",}\s]+("?)/gi,
    '$1$2[REDACTED]$3',
  );
  // bare key=value already handled by redactSecrets; reinforce token=
  text = text.replace(
    /\b((?:token|secret|key|password)\s*=\s*)(\S+)/gi,
    '$1[REDACTED]',
  );
  return text;
}

module.exports = { redactShopSecrets };