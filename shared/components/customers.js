'use strict';

/**
 * FR-196: Customers + Widgets registry helpers (a_search / a_search_sandbox).
 * Default store is MemoryCustomersStore for unit tests; inject an MSSQL adapter later.
 * madeiradb is never written (FR-251).
 */

const crypto = require('node:crypto');

const LAYOUTS = new Set(['horizontal', 'vertical', 'fullscreen']);
const CREATED_VIA = new Set(['extension', 'smartcatalogue', 'clubmadeira', 'migration']);
const UPGRADE_STATUS = new Set(['none', 'active', 'lapsed']);
const WIDGET_STATUS = new Set(['active', 'removed']);

/**
 * @param {string} host
 * @returns {string}
 */
function normalizeHost(host) {
  const s = host == null ? '' : String(host).trim().toLowerCase();
  if (!s) {
    const err = new Error('host is required');
    err.code = 'host_required';
    throw err;
  }
  return s;
}

/**
 * @param {string} layout
 * @returns {string}
 */
function assertLayout(layout) {
  const s = layout == null ? '' : String(layout).trim();
  if (!LAYOUTS.has(s)) {
    const err = new Error('layout must be horizontal|vertical|fullscreen');
    err.code = 'invalid_layout';
    throw err;
  }
  return s;
}

/**
 * In-memory Customers + Widgets store (FR-196 tests).
 */
class MemoryCustomersStore {
  constructor() {
    /** @type {Map<string, object>} host -> customer */
    this.byHost = new Map();
    /** @type {Map<string, object>} customerNumber -> customer */
    this.byNumber = new Map();
    /** @type {Map<string, object>} widgetGuid -> widget */
    this.widgets = new Map();
    this._nextCustomer = 1;
  }

  /**
   * @param {{ host: string }} input
   * @returns {object}
   */
  ensureCustomer(input) {
    const host = normalizeHost(input.host);
    const existing = this.byHost.get(host);
    if (existing) return { ...existing };
    const now = new Date().toISOString();
    const customerNumber = String(this._nextCustomer++);
    const row = {
      customerNumber,
      host,
      approved: false,
      clubId: null,
      partnerId: null,
      dnsCheckedAt: null,
      upgradeStatus: 'none',
      upgradeSubscriptionId: null,
      upgradeCheckedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.byHost.set(host, row);
    this.byNumber.set(customerNumber, row);
    return { ...row };
  }

  /**
   * @param {string} host
   * @returns {object|null}
   */
  getCustomerByHost(host) {
    const row = this.byHost.get(normalizeHost(host));
    return row ? { ...row } : null;
  }

  /**
   * @param {object} input
   * @returns {object}
   */
  createWidget(input) {
    const layout = assertLayout(input.layout);
    const createdVia = String(input.createdVia || '').trim();
    if (!CREATED_VIA.has(createdVia)) {
      const err = new Error('createdVia must be extension|smartcatalogue|clubmadeira|migration');
      err.code = 'invalid_created_via';
      throw err;
    }
    const host = input.host != null && String(input.host).trim() !== ''
      ? normalizeHost(input.host)
      : null;
    let customerNumber = null;
    let boundAt = null;
    if (host) {
      const cust = this.ensureCustomer({ host });
      customerNumber = cust.customerNumber;
      boundAt = new Date().toISOString();
    }
    const now = new Date().toISOString();
    const widgetGuid = crypto.randomUUID();
    const row = {
      widgetGuid,
      customerNumber,
      host,
      layout,
      createdVia,
      createdByUserId: input.createdByUserId != null ? String(input.createdByUserId) : null,
      createdAt: now,
      boundAt,
      status: 'active',
    };
    this.widgets.set(widgetGuid, row);
    return { ...row };
  }

  /**
   * @param {string} widgetGuid
   * @returns {object|null}
   */
  getWidget(widgetGuid) {
    const row = this.widgets.get(String(widgetGuid || ''));
    return row ? { ...row } : null;
  }

  /**
   * @param {string} customerNumber
   * @returns {object[]}
   */
  listActiveWidgets(customerNumber) {
    const n = String(customerNumber || '');
    return [...this.widgets.values()]
      .filter((w) => w.customerNumber === n && w.status === 'active')
      .map((w) => ({ ...w }));
  }
}

/**
 * @param {MemoryCustomersStore} store
 * @param {{ host: string }} input
 */
function ensureCustomer(store, input) {
  return store.ensureCustomer(input);
}

/**
 * @param {MemoryCustomersStore} store
 * @param {string} host
 */
function getCustomerByHost(store, host) {
  return store.getCustomerByHost(host);
}

/**
 * @param {MemoryCustomersStore} store
 * @param {object} input
 */
function createWidget(store, input) {
  return store.createWidget(input);
}

/**
 * @param {MemoryCustomersStore} store
 * @param {string} widgetGuid
 */
function getWidget(store, widgetGuid) {
  return store.getWidget(widgetGuid);
}

/**
 * @param {MemoryCustomersStore} store
 * @param {string} customerNumber
 */
function listActiveWidgets(store, customerNumber) {
  return store.listActiveWidgets(customerNumber);
}

module.exports = {
  MemoryCustomersStore,
  ensureCustomer,
  getCustomerByHost,
  createWidget,
  getWidget,
  listActiveWidgets,
  normalizeHost,
  assertLayout,
  LAYOUTS,
  CREATED_VIA,
  UPGRADE_STATUS,
  WIDGET_STATUS,
};
