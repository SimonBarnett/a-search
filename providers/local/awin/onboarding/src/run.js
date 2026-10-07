'use strict';

/**
 * Awin onboarding runOnce (FR-049c stub + FR-050d sandbox mode).
 *
 * Sandbox (`A_SEARCH_ENV=sandbox` or `deps.sandbox===true`): emit safe test
 * signups from a fixture — **never** calls live Awin HTTP.
 *
 * Live join sync remains later FR-050 slices (uses fetchJoinedProgrammes).
 */

const fs = require('node:fs');
const path = require('node:path');
const { createMerchantUser } = require('./createMerchantUser');
const { emitSignupRow } = require('./emitSignupRow');

/**
 * @param {object} [deps]
 * @returns {boolean}
 */
function isSandbox(deps = {}) {
  if (deps.sandbox === true) return true;
  if (deps.sandbox === false) return false;
  const env = deps.env || deps.envVars || process.env;
  const v = String((env && env.A_SEARCH_ENV) || 'sandbox').trim();
  return v !== 'live';
}

/**
 * @param {object} [deps]
 * @returns {object[]}
 */
function loadSandboxProgrammes(deps = {}) {
  if (Array.isArray(deps.sandboxProgrammes)) return deps.sandboxProgrammes;
  // providers/local/awin/onboarding/src → repo root is five levels up
  const defaultFixture = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'tests',
    'fixtures',
    'awin-joined-programmes.json',
  );
  const fixturePath = deps.sandboxFixturePath || defaultFixture;
  const file = fs.existsSync(fixturePath) ? fixturePath : null;
  if (!file) {
    return [
      {
        id: 'sandbox-1',
        name: 'Sandbox Merchant',
        displayUrl: 'https://sandbox.example',
      },
    ];
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(raw.programmes) ? raw.programmes : Array.isArray(raw) ? raw : [];
}

/**
 * @param {object} [deps]
 * @returns {Promise<{ processed: number, remaining: number, signups: object[] }>}
 */
async function runOnce(deps = {}) {
  if (!isSandbox(deps)) {
    // Live path not implemented in this FR — empty drain (no HTTP).
    return { processed: 0, remaining: 0, signups: [] };
  }

  // One-shot sandbox drain: process fixture programmes once, then remaining=0.
  const state = deps.state || (deps.state = { done: false });
  if (state.done) {
    return { processed: 0, remaining: 0, signups: [] };
  }

  if (typeof deps.httpGet === 'function' && deps.forbidLiveHttp !== false) {
    // Guard: sandbox must not exercise a live client even if injected by mistake.
    // Tests assert httpGet call count stays 0.
  }

  const programmes = loadSandboxProgrammes(deps);
  const envName = 'sandbox';
  const signups = [];
  let processed = 0;

  const store = deps.userStore || (deps.userStore = new Map());
  const findByEmail =
    deps.findByEmail ||
    (async (email) => store.get(email) || null);
  const insertUser =
    deps.insertUser ||
    (async (row) => {
      store.set(row.email, row);
      return row;
    });

  for (const prog of programmes) {
    const emailLocal =
      prog.id != null
        ? `awin-${prog.id}@sandbox.invalid`
        : `awin-${processed}@sandbox.invalid`;
    const { user, created } = await createMerchantUser({
      email: emailLocal,
      companyName: prog.name || prog.programmeName || 'Sandbox Merchant',
      website: prog.displayUrl || prog.website,
      advertiserId: prog.id != null ? prog.id : `sb-${processed}`,
      env: envName,
      source: 'awin',
      findByEmail,
      insertUser,
      newUserId: deps.newUserId,
    });
    if (!created && deps.skipExistingSignups !== false) {
      // Already known — still count as processed for drain math, no new signup.
      processed += 1;
      continue;
    }
    const row = emitSignupRow({
      user_id: user.user_id,
      company_name: user.company_name || prog.name || 'Sandbox Merchant',
      email: user.email,
      advertiserId: user.advertiserId || prog.id,
      env: envName,
      website: prog.displayUrl || prog.website,
      logoUrl: prog.logoUrl,
      primarySector: prog.primarySector || prog.sector,
      description: prog.description,
      source: 'awin',
      status: 'joined',
    });
    signups.push(row);
    processed += 1;
  }

  state.done = true;
  return {
    processed,
    remaining: 0,
    signups,
  };
}

module.exports = { runOnce, isSandbox, loadSandboxProgrammes };
