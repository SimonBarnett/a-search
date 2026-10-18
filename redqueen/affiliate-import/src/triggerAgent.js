'use strict';

/**
 * FR #4001: on failure, start a fixing agent (Grok first, Cursor when Grok tokens exhausted).
 * Never log provider credentials. Code fixes via PR only (agent brief).
 */

/**
 * @param {{
 *   logPath?: string,
 *   provider: string,
 *   affiliateid: string,
 *   fileKey: string,
 *   reason: string,
 *   grokTokensRemaining?: number,
 *   startGrok?: (brief: object) => Promise|void,
 *   startCursor?: (brief: object) => Promise|void,
 * }} opts
 */
async function triggerFixingAgent(opts) {
  const rules = [
    'Code fixes go through a PR on SimonBarnett/a-search, never a hotpatch',
    'Data fixes only in asearch DB on walrus, never madeiradb',
    'Never print or log provider credentials',
    'Do not loosen the safety guard',
    'If unfixed, file/update one a-search issue with the log; leave the file',
  ].concat(Array.isArray(opts.rulesExtra) ? opts.rulesExtra : []);
  const brief = {
    kind: 'affiliate-import-fix',
    fr: opts.fr || '#4001',
    provider: opts.provider,
    affiliateid: opts.affiliateid,
    fileKey: opts.fileKey,
    reason: opts.reason,
    logPath: opts.logPath || null,
    cwdHint: opts.cwdHint || null,
    rules,
  };
  // Redact accidental secret-shaped fields if a caller stuffed meta in
  const safe = JSON.parse(JSON.stringify(brief));
  for (const bad of ['password', 'apitoken', 'username', 'secret', 'token']) {
    delete safe[bad];
  }

  const grokLeft =
    opts.grokTokensRemaining == null ? 1 : Number(opts.grokTokensRemaining);
  if (grokLeft > 0 && typeof opts.startGrok === 'function') {
    await opts.startGrok(safe);
    return { engine: 'grok', brief: safe };
  }
  if (typeof opts.startCursor === 'function') {
    await opts.startCursor(safe);
    return { engine: 'cursor', brief: safe };
  }
  return { engine: 'none', brief: safe };
}

/**
 * Strip credential-like values from log lines (never echo #3999 secrets).
 * @param {string} line
 */
function redactCredentialLine(line) {
  let s = String(line);
  s = s.replace(
    /(password|apitoken|api[_-]?token|username|secret|authorization)\s*[:=]\s*\S+/gi,
    '$1=***',
  );
  s = s.replace(/Bearer\s+[A-Za-z0-9._\-]+/g, 'Bearer ***');
  return s;
}

module.exports = {
  triggerFixingAgent,
  redactCredentialLine,
};
