'use strict';

/**
 * FR-135: copy node_modules/mssql (+ transitive deps) into a staged Lambda asset.
 * Used by local-provider worker staging and maintainer staging.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {string} repoRoot
 * @param {string} assetOutDir staged asset root
 * @returns {{ packages: string[] }}
 */
function stageMssqlNodeModules(repoRoot, assetOutDir) {
  const root = repoRoot;
  const mssqlSrc = path.join(root, 'node_modules', 'mssql');
  if (!fs.existsSync(mssqlSrc)) {
    throw new Error(
      `stageMssqlNodeModules: missing ${mssqlSrc} (run npm install at repo root)`,
    );
  }
  const nmOut = path.join(assetOutDir, 'node_modules');
  fs.mkdirSync(nmOut, { recursive: true });

  /** @type {Set<string>} */
  const copied = new Set();

  /**
   * @param {string} name package name e.g. mssql or @azure/core-auth
   */
  function copyPackage(name) {
    if (!name || copied.has(name)) return;
    const src = path.join(root, 'node_modules', ...name.split('/'));
    if (!fs.existsSync(src)) {
      // Optional / platform deps may be absent — skip quietly.
      return;
    }
    copied.add(name);
    const dest = path.join(nmOut, ...name.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true });

    let pkg;
    try {
      pkg = JSON.parse(
        fs.readFileSync(path.join(src, 'package.json'), 'utf8'),
      );
    } catch {
      return;
    }
    const deps = Object.assign(
      {},
      pkg.dependencies || {},
      pkg.optionalDependencies || {},
    );
    for (const dep of Object.keys(deps)) {
      copyPackage(dep);
    }
  }

  copyPackage('mssql');
  if (!copied.has('mssql')) {
    throw new Error('stageMssqlNodeModules: failed to copy mssql');
  }
  return { packages: [...copied].sort() };
}

/**
 * True when registry folder is under providers/local/.
 * @param {string} folder
 */
function isLocalProviderFolder(folder) {
  const f = String(folder || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  return f.startsWith('providers/local/');
}

module.exports = {
  stageMssqlNodeModules,
  isLocalProviderFolder,
};