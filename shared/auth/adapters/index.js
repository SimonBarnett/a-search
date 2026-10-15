'use strict';

/**
 * FR-227: OAuth shortlist adapter scaffolds.
 * Register fixture adapters via registerAuthAdapter -- no core registry.js edit.
 */

const { registerAuthAdapter } = require('../registry');
const { SHORTLIST_IDS, secretNamesFor } = require('../secrets');
const { createFixtureAdapter } = require('./fixture');

/**
 * Register stay-dark fixture scaffolds for the OAuth shortlist.
 * @param {{ mode?: 'fixture' }} [opts]
 */
function registerShortlistAdapters(opts) {
  const mode = (opts && opts.mode) || 'fixture';
  if (mode !== 'fixture') {
    throw new Error('unsupported_auth_adapter_mode');
  }
  for (const id of SHORTLIST_IDS) {
    registerAuthAdapter(id, createFixtureAdapter(id));
  }
}

module.exports = {
  SHORTLIST_IDS,
  secretNamesFor,
  createFixtureAdapter,
  registerShortlistAdapters,
};
