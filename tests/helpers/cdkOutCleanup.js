'use strict';

/**
 * FR #3763: remove cdk.out-* dirs left by synth tests (named cdk.out-fr142 etc.
 * as well as private cdk.out-<pid>-<seq>). Plain `cdk.out` (no hyphen suffix)
 * is left alone. FR #3790: cdk.out-shared-* is the FR #3764 cross-batch cache
 * and is not swept or registered. Set A_SEARCH_KEEP_CDK_OUT=1 to skip.
 */

const fs = require('node:fs');
const path = require('node:path');

/** @type {Set<string>} */
const registered = new Set();
let exitHooked = false;

/**
 * @param {string} name basename
 * @returns {boolean}
 */
function isCdkOutStar(name) {
  if (typeof name !== 'string') return false;
  // FR #3790: shared synth cache must survive the batch sweep.
  if (/^cdk\.out-shared-/.test(name)) return false;
  return /^cdk\.out-/.test(name);
}

/**
 * Register a cdk.out-* path for process-exit cleanup.
 * @param {string} dir
 * @returns {string} dir
 */
function registerCdkOutDir(dir) {
  if (!dir) return dir;
  const base = path.basename(dir);
  if (!isCdkOutStar(base)) return dir;
  registered.add(path.resolve(dir));
  if (!exitHooked) {
    exitHooked = true;
    process.on('exit', () => {
      cleanupRegisteredCdkOutDirs();
    });
  }
  return dir;
}

/**
 * Remove every registered cdk.out-* directory (best effort).
 * @returns {string[]} removed absolute paths
 */
function cleanupRegisteredCdkOutDirs() {
  if (process.env.A_SEARCH_KEEP_CDK_OUT === '1') return [];
  const removed = [];
  for (const dir of registered) {
    if (!isCdkOutStar(path.basename(dir))) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
      removed.push(dir);
    } catch {
      /* best effort */
    }
  }
  registered.clear();
  return removed;
}

/**
 * Sweep a workspace root for leftover cdk.out-* directories (named + private).
 * Does not remove a plain `cdk.out` directory.
 * @param {string} root
 * @returns {string[]} removed basenames
 */
function sweepCdkOutDirs(root) {
  if (process.env.A_SEARCH_KEEP_CDK_OUT === '1') return [];
  if (!root || !fs.existsSync(root)) return [];
  const removed = [];
  let ents;
  try {
    ents = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const ent of ents) {
    if (!ent.isDirectory() || !isCdkOutStar(ent.name)) continue;
    const full = path.join(root, ent.name);
    try {
      fs.rmSync(full, { recursive: true, force: true, maxRetries: 3 });
      removed.push(ent.name);
    } catch {
      /* best effort */
    }
  }
  return removed;
}

module.exports = {
  isCdkOutStar,
  registerCdkOutDir,
  cleanupRegisteredCdkOutDirs,
  sweepCdkOutDirs,
};
