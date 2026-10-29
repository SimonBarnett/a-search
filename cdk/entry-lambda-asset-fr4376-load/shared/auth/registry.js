'use strict';

/**
 * FR-226: pluggable auth provider registry.
 * Each adapter result must expose email OR phone OR contact (fail closed).
 * Tests / deploy add adapters via registerAuthAdapter without editing this file.
 */

const fs = require('node:fs');
const path = require('node:path');

const REGISTRY_PATH = path.join(__dirname, 'registry.json');

/** @type {Map<string, { exchange: Function }>} */
const adapters = new Map();

class AuthContactError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'AuthContactError';
    this.code = 'contact_required';
  }
}

/**
 * @returns {{ providers: Array<{ id: string, label?: string, enabled: boolean, kind?: string }> }}
 */
function loadAuthRegistry() {
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.providers)) {
    throw new Error('shared/auth/registry.json missing providers[]');
  }
  return data;
}

/**
 * @returns {string[]}
 */
function enabledAuthProviders() {
  return loadAuthRegistry()
    .providers.filter((p) => p && p.enabled === true)
    .map((p) => p.id);
}

/**
 * Register an adapter (pluggable -- no core edit required).
 * @param {string} id
 * @param {{ exchange: (ctx: object) => Promise<object>|object }} adapter
 */
function registerAuthAdapter(id, adapter) {
  const key = String(id || '')
    .trim()
    .toLowerCase();
  if (!key) {
    throw new Error('adapter_id_required');
  }
  if (!adapter || typeof adapter.exchange !== 'function') {
    throw new Error('adapter_exchange_required');
  }
  adapters.set(key, adapter);
}

/**
 * @param {string} id
 */
function getAuthAdapter(id) {
  const key = String(id || '')
    .trim()
    .toLowerCase();
  const adapter = adapters.get(key);
  if (!adapter) {
    const err = new Error('unknown_auth_provider');
    err.code = 'unknown_auth_provider';
    throw err;
  }
  return adapter;
}

function clearAuthAdapters() {
  adapters.clear();
}

/**
 * Normalize and require contact claims.
 * @param {object} raw
 * @returns {{
 *   provider: string,
 *   subject: string,
 *   email?: string,
 *   phone?: string,
 *   contact?: string,
 * }}
 */
function normalizeAuthClaims(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new AuthContactError('contact_required');
  }
  const provider = String(raw.provider || '')
    .trim()
    .toLowerCase();
  const subject = String(raw.subject || '').trim();
  if (!provider || !subject) {
    const err = new Error('provider_subject_required');
    err.code = 'provider_subject_required';
    throw err;
  }
  const email =
    raw.email != null && String(raw.email).trim()
      ? String(raw.email).trim()
      : undefined;
  const phone =
    raw.phone != null && String(raw.phone).trim()
      ? String(raw.phone).trim()
      : undefined;
  const contact =
    raw.contact != null && String(raw.contact).trim()
      ? String(raw.contact).trim()
      : undefined;
  if (!email && !phone && !contact) {
    throw new AuthContactError('contact_required');
  }
  /** @type {{ provider: string, subject: string, email?: string, phone?: string, contact?: string }} */
  const out = { provider, subject };
  if (email) out.email = email;
  if (phone) out.phone = phone;
  if (contact) out.contact = contact;
  return out;
}

/**
 * Accept an adapter result or fail closed.
 * @param {object} raw
 */
function acceptAuthResult(raw) {
  return normalizeAuthClaims(raw);
}

module.exports = {
  AuthContactError,
  loadAuthRegistry,
  enabledAuthProviders,
  registerAuthAdapter,
  getAuthAdapter,
  clearAuthAdapters,
  normalizeAuthClaims,
  acceptAuthResult,
  REGISTRY_PATH,
};
