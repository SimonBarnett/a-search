'use strict';

/**
 * FR-120: detect SQL Server "Invalid object name" / missing-table errors.
 * Used by local Parts selftest probes so absence of dbo.Parts is a clear
 * `missing_table` code rather than a generic connect failure.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isMissingTableError(err) {
  const code =
    err && typeof err === 'object' && err.code != null ? String(err.code) : '';
  const num =
    err && typeof err === 'object' && typeof err.number === 'number'
      ? err.number
      : null;
  const original =
    err && typeof err === 'object' && err.originalError
      ? err.originalError
      : null;
  const originalNum =
    original && typeof original.number === 'number' ? original.number : null;
  const msg =
    err && typeof err === 'object' && err.message != null
      ? String(err.message)
      : err != null
        ? String(err)
        : '';
  const blob = `${code}\n${msg}`.toLowerCase();

  // SQL Server: Invalid object name → 208
  if (num === 208 || originalNum === 208) return true;
  if (/invalid object name/.test(blob)) return true;
  if (/invalid object name ['`]dbo\.parts['`]/i.test(msg)) return true;
  if (
    /cannot find (the )?(object|table)/.test(blob) &&
    /\bparts\b/.test(blob)
  ) {
    return true;
  }
  return false;
}

module.exports = {
  isMissingTableError,
};
