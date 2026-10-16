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
   * Patch customer flags (approval / club / partner) for FR-199/200 tests.
   * @param {string} host
   * @param {{ approved?: boolean, clubId?: string|null, partnerId?: string|null }} patch
   * @returns {object}
   */
  updateCustomer(host, patch = {}) {
    const key = normalizeHost(host);
    const row = this.byHost.get(key);
    if (!row) {
      const err = new Error('customer_not_found');
      err.code = 'customer_not_found';
      throw err;
    }
    if (patch.approved !== undefined) row.approved = !!patch.approved;
    if (patch.clubId !== undefined) {
      row.clubId =
        patch.clubId == null || String(patch.clubId).trim() === ''
          ? null
          : String(patch.clubId).trim();
    }
    if (patch.partnerId !== undefined) {
      row.partnerId =
        patch.partnerId == null || String(patch.partnerId).trim() === ''
          ? null
          : String(patch.partnerId).trim();
    }
    if (patch.dnsCheckedAt !== undefined) {
      row.dnsCheckedAt =
        patch.dnsCheckedAt == null || String(patch.dnsCheckedAt).trim() === ''
          ? null
          : String(patch.dnsCheckedAt).trim();
    }
    row.updatedAt = new Date().toISOString();
    this.byHost.set(key, row);
    this.byNumber.set(row.customerNumber, row);
    return { ...row };
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
    // FR-232 rule 1: lowercase canonical RFC 4122 UUID
    const widgetGuid = crypto.randomUUID().toLowerCase();
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
    const guid = String(widgetGuid || '').trim().toLowerCase();
    const row = this.widgets.get(guid);
    return row ? { ...row } : null;
  }

  /**
   * FR-232 rule 5 / FR-198: bind an unbound widgetGuid to host on first /parts.
   * @param {{ widgetGuid: string, host: string }} input
   * @returns {object}
   */
  bindWidget(input) {
    const guid = String(input.widgetGuid || '').trim().toLowerCase();
    const row = this.widgets.get(guid);
    if (!row) {
      const err = new Error('widget_not_found');
      err.code = 'widget_not_found';
      throw err;
    }
    if (row.status === 'removed') {
      const err = new Error('widget_removed');
      err.code = 'widget_removed';
      throw err;
    }
    const host = normalizeHost(input.host);
    if (row.host && row.host !== host) {
      const err = new Error('widget_host_mismatch');
      err.code = 'widget_host_mismatch';
      throw err;
    }
    if (row.host === host && row.customerNumber) {
      return { ...row };
    }
    const cust = this.ensureCustomer({ host });
    const now = new Date().toISOString();
    row.host = host;
    row.customerNumber = cust.customerNumber;
    row.boundAt = row.boundAt || now;
    this.widgets.set(guid, row);
    return { ...row };
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
 * @param {string} host
 * @param {object} patch
 */
function updateCustomer(store, host, patch) {
  return store.updateCustomer(host, patch);
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
 * @param {{ widgetGuid: string, host: string }} input
 */
function bindWidget(store, input) {
  return store.bindWidget(input);
}

/**
 * @param {MemoryCustomersStore} store
 * @param {string} customerNumber
 */
function listActiveWidgets(store, customerNumber) {
  return store.listActiveWidgets(customerNumber);
}

/** Process-local default store shared by POST /widgets, GET /parts, GET /go (FR-232). */
let defaultCustomersStore = null;

/**
 * @returns {MemoryCustomersStore}
 */
function getDefaultCustomersStore() {
  if (!defaultCustomersStore) {
    defaultCustomersStore = new MemoryCustomersStore();
  }
  return defaultCustomersStore;
}

/**
 * Test helper: replace or clear the process-local default store.
 * @param {MemoryCustomersStore|null} [store]
 */
function setDefaultCustomersStore(store) {
  defaultCustomersStore = store || null;
}

module.exports = {
  MemoryCustomersStore,
  getDefaultCustomersStore,
  setDefaultCustomersStore,
  ensureCustomer,
  getCustomerByHost,
  updateCustomer,
  createWidget,
  getWidget,
  bindWidget,
  listActiveWidgets,
  normalizeHost,
  assertLayout,
  LAYOUTS,
  CREATED_VIA,
  UPGRADE_STATUS,
  WIDGET_STATUS,
};
