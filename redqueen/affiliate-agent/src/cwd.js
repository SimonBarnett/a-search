'use strict';

/**
 * FR #4701: resolve affiliate provider from a-affiliates cwd.
 * Accepts .../a-affiliates/{provider}[/...]
 */

const path = require('node:path');
const fs = require('node:fs');

const SUPPORTED = new Set(['awin', 'rakuten']);

/**
 * @param {string} cwd
 * @param {{ existsSync?: Function }} [io]
 * @returns {{
 *   ok: true,
 *   provider: string,
 *   affiliatesRoot: string,
 *   providerRoot: string,
 * } | { ok: false, code: string, detail?: string }}
 */
function resolveProviderFromCwd(cwd, io = {}) {
  void io;
  const raw = path.resolve(String(cwd || process.cwd()));
  const norm = raw.replace(/\//g, '\\');
  const lower = norm.toLowerCase();
  const marker = '\\a-affiliates\\';
  const at = lower.lastIndexOf(marker);
  let affiliatesRoot;
  let rest;
  if (at >= 0) {
    affiliatesRoot = norm.slice(0, at + marker.length - 1); // ...\a-affiliates
    rest = norm.slice(at + marker.length);
  } else if (lower.endsWith('\\a-affiliates') || lower === 'a-affiliates') {
    return {
      ok: false,
      code: 'not_a_affiliates_provider',
      detail: raw,
    };
  } else {
    // POSIX-style paths in tests
    const posix = raw.replace(/\\/g, '/');
    const m = posix.toLowerCase().lastIndexOf('/a-affiliates/');
    if (m < 0) {
      return {
        ok: false,
        code: 'not_a_affiliates_provider',
        detail: raw,
      };
    }
    affiliatesRoot = posix.slice(0, m + '/a-affiliates'.length);
    rest = posix.slice(m + '/a-affiliates/'.length);
  }
  const providerSeg = String(rest || '')
    .split(/[/\\]/)
    .filter(Boolean)[0];
  const provider = String(providerSeg || '')
    .trim()
    .toLowerCase();
  if (!provider || !SUPPORTED.has(provider)) {
    return {
      ok: false,
      code: 'unsupported_provider',
      detail: provider || raw,
    };
  }
  const providerRoot = path.join(affiliatesRoot, provider);
  return {
    ok: true,
    provider,
    affiliatesRoot,
    providerRoot,
  };
}

module.exports = {
  resolveProviderFromCwd,
  SUPPORTED_PROVIDERS: SUPPORTED,
};
