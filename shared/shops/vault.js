'use strict';

/**
 * FR-235 + FR-236: credentials vault helpers.
 * createMemoryVault: Secrets Manager-shaped put({env,shopId,credentials}).
 * createCredentialsVault: ref-keyed put(ref, payload) for Shopify connect tests.
 * Never log credentials / token values.
 */

/**
 * @returns {{
 *   put: (args: { env: string, shopId: string, credentials: object }) => Promise<string>,
 *   get: (ref: string) => Promise<object|null>,
 *   delete: (ref: string) => Promise<void>,
 *   _store: Map<string, object>,
 * }}
 */
function createMemoryVault() {
  /** @type {Map<string, object>} */
  const store = new Map();
  return {
    _store: store,
    async put(args) {
      const env = String(args.env);
      const shopId = String(args.shopId);
      const ref = `a-search/${env}/shops/${shopId}`;
      store.set(ref, {
        ...(args.credentials && typeof args.credentials === 'object'
          ? args.credentials
          : {}),
      });
      return ref;
    },
    async get(ref) {
      const v = store.get(String(ref));
      return v ? { ...v } : null;
    },
    async delete(ref) {
      store.delete(String(ref));
    },
  };
}

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

/**
 * Build the Secrets Manager name / ARN path shape (pointer only).
 * @param {string} env
 * @param {string} shopId
 */
function vaultSecretName(env, shopId) {
  return `a-search/${String(env)}/shops/${String(shopId)}`;
}

module.exports = {
  createMemoryVault,
  createCredentialsVault,
  vaultSecretName,
};
