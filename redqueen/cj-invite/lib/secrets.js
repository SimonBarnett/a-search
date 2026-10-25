'use strict';

/**
 * FR #5066: load CJ invite secrets from file (names only in docs).
 * C:\passwords\cj.secret.txt — line 4 = personal access token, line 5 = website id.
 * Never log values.
 */

import fs from 'fs';

/**
 * @param {string} filePath
 * @returns {{ token: string, websiteId: string }}
 */
export function loadCjSecretFile(filePath) {
  const p = String(filePath || '').trim();
  if (!p) throw new Error('cj_secret_file_required');
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    throw new Error('cj_secret_file_missing');
  }
  const lines = raw.split(/\r?\n/);
  // 1-based lines 4 and 5
  const token = String(lines[3] || '').trim();
  const websiteId = String(lines[4] || '').trim();
  if (!token) throw new Error('cj_token_line_empty');
  return { token, websiteId };
}

/**
 * Redact secret-looking substrings for logs / report.
 * @param {string} text
 */
export function redactSecrets(text) {
  return String(text || '')
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, '$1***')
    .replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*\S+/gi, '$1=***')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9._\-]+\b/g, '***jwt***');
}
