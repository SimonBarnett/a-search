'use strict';

/**
 * FR-236 / FR-235 prelude: in-memory credentials vault (tests).
 * Production writes Secrets Manager / a_search vault; never log token values.
 */

/**
 * @returns {{
 *   put: (ref: string, payload: object) => string,
 *   get: (ref: string) => object|null,
 *   delete: (ref: string) => boolean,
 * }}
 */
function createCredentialsVault() {
  /** @type {Map<string, object>} */
  const byRef = new Map();
  return {
    put(ref, payload) {
      const key = String(ref);
      byRef.set(key, payload && typeof payload === 'object' ? { ...payload } : {});
      return key;
    },
    get(ref) {
      const row = byRef.get(String(ref));
      return row ? { ...row } : null;
    },
    delete(ref) {
      return byRef.delete(String(ref));
    },
  };
}

module.exports = { createCredentialsVault };
