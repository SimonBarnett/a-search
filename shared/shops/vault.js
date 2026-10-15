'use strict';

/**
 * FR-235: credentials vault helpers. Production uses Secrets Manager;
 * tests inject createMemoryVault. Never log credentials.
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
      // Store opaque copy; callers must not log
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
 * Build the Secrets Manager name / ARN path shape (pointer only).
 * @param {string} env
 * @param {string} shopId
 */
function vaultSecretName(env, shopId) {
  return `a-search/${String(env)}/shops/${String(shopId)}`;
}

module.exports = {
  createMemoryVault,
  vaultSecretName,
};