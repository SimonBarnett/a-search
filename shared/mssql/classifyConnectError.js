'use strict';

/**
 * FR-119: classify MSSQL connect/query failures for local selftest probes.
 * Distinguishes auth failures from network/host/unreachable errors.
 *
 * @param {unknown} err
 * @returns {'mssql_auth_failed'|'mssql_unreachable'}
 */
function classifyMssqlConnectError(err) {
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

  if (num === 18456 || originalNum === 18456) return 'mssql_auth_failed';
  if (/\belogin\b/.test(blob)) return 'mssql_auth_failed';
  if (/login failed/.test(blob)) return 'mssql_auth_failed';
  if (
    /password.*(fail|incorrect|invalid)|authentication.*(fail|error)|access is denied|not authorized|login.*denied/.test(
      blob,
    )
  ) {
    return 'mssql_auth_failed';
  }

  return 'mssql_unreachable';
}

module.exports = {
  classifyMssqlConnectError,
};
