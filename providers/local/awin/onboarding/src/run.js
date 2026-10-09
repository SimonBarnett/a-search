'use strict';

/**
 * Awin onboarding runOnce (FR-049c + FR-050d sandbox + FR-125 live HTTP drain).
 *
 * Sandbox (`A_SEARCH_ENV=sandbox` or `deps.sandbox===true`): emit safe test
 * signups from a fixture — **never** calls live Awin HTTP.
 *
 * Live (`A_SEARCH_ENV=live` or `deps.sandbox===false`): fetch joined programmes
 * via injectable `httpGet` (FR-050a), create merchant users, emit signup rows,
 * and drain until `remaining=0` (S13 / shared/onboarding/drain.js).
 */

const fs = require('node:fs');
const path = require('node:path');
const { createMerchantUser } = require('./createMerchantUser');
const { emitSignupRow } = require('./emitSignupRow');
const {
  fetchJoinedProgrammes,
  AwinOnboardingError,
} = require('./fetchJoinedProgrammes');

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
  return Array.isArray(raw.programmes)
    ? raw.programmes
    : Array.isArray(raw)
      ? raw
      : [];
}

/**
 * @param {object} deps
 * @returns {{ findByEmail: Function, insertUser: Function }}
 */
function userStoreHooks(deps) {
  const store = deps.userStore || (deps.userStore = new Map());
  const findByEmail =
    deps.findByEmail || (async (email) => store.get(email) || null);
  const insertUser =
    deps.insertUser ||
    (async (row) => {
      store.set(row.email, row);
      return row;
    });
  return { findByEmail, insertUser };
}

/**
 * @param {object} prog
 * @param {string} envName
 * @param {number} processed
 * @returns {string}
 */
function programmeEmail(prog, envName, processed) {
  if (prog && prog.email != null && String(prog.email).includes('@')) {
    return String(prog.email).trim().toLowerCase();
  }
  const id = prog && prog.id != null ? String(prog.id) : String(processed);
  const host = envName === 'live' ? 'awin.invalid' : 'sandbox.invalid';
  return `awin-${id}@${host}`;
}

/**
 * Process one programme into an optional signup row.
 * @returns {Promise<{ processedDelta: number, signup: object|null }>}
 */
async function processProgramme(prog, envName, processed, deps, hooks) {
  const advertiserId = prog.id != null ? prog.id : `sb-${processed}`;
  const { user, created } = await createMerchantUser({
    email: programmeEmail(prog, envName, processed),
    companyName: prog.name || prog.programmeName || 'Awin Merchant',
    website: prog.displayUrl || prog.website,
    advertiserId,
    env: envName,
    source: 'awin',
    findByEmail: hooks.findByEmail,
    insertUser: hooks.insertUser,
    newUserId: deps.newUserId,
  });
  if (!created && deps.skipExistingSignups !== false) {
    return { processedDelta: 1, signup: null };
  }
  const row = emitSignupRow({
    user_id: user.user_id,
    company_name: user.company_name || prog.name || 'Awin Merchant',
    email: user.email,
    advertiserId: user.advertiserId || advertiserId,
    env: envName,
    website: prog.displayUrl || prog.website,
    logoUrl: prog.logoUrl,
    primarySector: prog.primarySector || prog.sector,
    description: prog.description,
    source: 'awin',
    status: 'joined',
  });
  return { processedDelta: 1, signup: row };
}

/**
 * Live HTTP drain: fetch joined programmes, batch-process, remaining→0.
 * @param {object} deps
 * @returns {Promise<{ processed: number, remaining: number, signups: object[] }>}
 */
async function runLiveOnce(deps) {
  const env = deps.env || deps.envVars || process.env;
  if (typeof deps.httpGet !== 'function') {
    throw new AwinOnboardingError(
      'missing_httpGet',
      'live Awin onboarding requires injectable deps.httpGet (no silent empty drain)',
    );
  }

  const state = deps.state || (deps.state = {});
  if (!Array.isArray(state.programmes)) {
    const fetched = await fetchJoinedProgrammes({
      env,
      httpGet: deps.httpGet,
    });
    state.programmes = Array.isArray(fetched.programmes)
      ? fetched.programmes
      : [];
    state.index = 0;
  }

  const programmes = state.programmes;
  let index = Number(state.index) || 0;
  if (index >= programmes.length) {
    state.index = programmes.length;
    return { processed: 0, remaining: 0, signups: [] };
  }

  const batchSize =
    deps.batchSize != null && Number(deps.batchSize) > 0
      ? Number(deps.batchSize)
      : programmes.length - index;

  const batch = programmes.slice(index, index + batchSize);
  const hooks = userStoreHooks(deps);
  const signups = [];
  let processed = 0;

  for (const prog of batch) {
    const { processedDelta, signup } = await processProgramme(
      prog,
      'live',
      index + processed,
      deps,
      hooks,
    );
    processed += processedDelta;
    if (signup) signups.push(signup);
  }

  state.index = index + batch.length;
  const remaining = Math.max(0, programmes.length - state.index);
  return { processed, remaining, signups };
}

/**
 * Sandbox fixture drain (never live HTTP).
 * @param {object} deps
 * @returns {Promise<{ processed: number, remaining: number, signups: object[] }>}
 */
async function runSandboxOnce(deps) {
  const state = deps.state || (deps.state = { done: false });
  if (state.done) {
    return { processed: 0, remaining: 0, signups: [] };
  }

  // Guard: sandbox must not exercise a live client even if injected by mistake.
  // Tests assert httpGet call count stays 0 (FR-050d).

  const programmes = loadSandboxProgrammes(deps);
  const envName = 'sandbox';
  const signups = [];
  let processed = 0;
  const hooks = userStoreHooks(deps);

  for (const prog of programmes) {
    const { processedDelta, signup } = await processProgramme(
      prog,
      envName,
      processed,
      deps,
      hooks,
    );
    processed += processedDelta;
    if (signup) signups.push(signup);
  }

  state.done = true;
  return {
    processed,
    remaining: 0,
    signups,
  };
}

/**
 * @param {object} [deps]
 * @returns {Promise<{ processed: number, remaining: number, signups: object[] }>}
 */
async function runOnce(deps = {}) {
  if (isSandbox(deps)) {
    return runSandboxOnce(deps);
  }
  return runLiveOnce(deps);
}

module.exports = {
  runOnce,
  isSandbox,
  loadSandboxProgrammes,
  AwinOnboardingError,
};
