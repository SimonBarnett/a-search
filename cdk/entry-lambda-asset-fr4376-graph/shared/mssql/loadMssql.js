'use strict';

/**
 * FR #4997: load mssql / mssql/msnodesqlv8 for Node and for SEA exes.
 *
 * Inside a Node single-executable application, plain require() only resolves
 * built-in modules. Native msnodesqlv8 must be loaded from disk beside the
 * exe via module.createRequire(process.execPath).
 */

const { createRequire } = require('node:module');

/**
 * @returns {boolean}
 */
function isSeaRuntime() {
  try {
    // node:sea is available when the process is a SEA binary (Node 20.12+).
    return require('node:sea').isSea() === true;
  } catch {
    return false;
  }
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isUnknownBuiltinModuleError(err) {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const code = /** @type {{ code?: string, message?: string }} */ (err).code;
  if (code === 'ERR_UNKNOWN_BUILTIN_MODULE') {
    return true;
  }
  const message = String(
    /** @type {{ message?: string }} */ (err).message || err,
  );
  return /No such built-in module:\s*mssql\/msnodesqlv8/i.test(message);
}

/**
 * @param {'mssql'|'mssql/msnodesqlv8'|string} modName
 * @param {{
 *   execPath?: string,
 *   forceBesideExe?: boolean,
 *   requireImpl?: NodeRequire,
 *   createRequireImpl?: (filename: string) => NodeRequire,
 * }} [opts]
 * @returns {any}
 */
function loadMssqlModule(modName, opts = {}) {
  const name =
    modName === 'mssql/msnodesqlv8' ? 'mssql/msnodesqlv8' : 'mssql';

  if (name === 'mssql') {
    // Pure-JS path stays a static require so esbuild can bundle it into SEA.
    // eslint-disable-next-line global-require
    return require('mssql');
  }

  const execPath =
    opts.execPath != null && String(opts.execPath).trim()
      ? String(opts.execPath)
      : process.execPath;
  const createReq =
    typeof opts.createRequireImpl === 'function'
      ? opts.createRequireImpl
      : createRequire;
  const forceBeside =
    opts.forceBesideExe === true || isSeaRuntime();

  const loadBesideExe = () => createReq(execPath)(name);

  if (forceBeside) {
    return loadBesideExe();
  }

  if (typeof opts.requireImpl === 'function') {
    try {
      return opts.requireImpl(name);
    } catch (err) {
      if (isUnknownBuiltinModuleError(err)) {
        return loadBesideExe();
      }
      throw err;
    }
  }

  try {
    // eslint-disable-next-line global-require
    return require('mssql/msnodesqlv8');
  } catch (err) {
    if (isUnknownBuiltinModuleError(err)) {
      return loadBesideExe();
    }
    throw err;
  }
}

module.exports = {
  loadMssqlModule,
  isSeaRuntime,
  isUnknownBuiltinModuleError,
};
