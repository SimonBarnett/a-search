'use strict';

/**
 * FR-156: optional deploy stage suffix for parallel AWS installs.
 *
 * Context key (cdk -c):
 *   stage  e.g. dev -> physical name suffix "-dev"
 *
 * Empty / unset stage: suffix "" (default names unchanged).
 * Stack construct id: ASearchStack or ASearchStack-<stage>.
 */

/**
 * @param {Record<string, unknown>} [context]
 * @returns {string} "" or "-dev" style suffix (leading hyphen)
 */
function resolveStageSuffix(context) {
  const ctx = context || {};
  if (!Object.prototype.hasOwnProperty.call(ctx, 'stage')) {
    return '';
  }
  const raw = ctx.stage;
  if (raw === undefined || raw === null) {
    return '';
  }
  const text = String(raw).trim().toLowerCase();
  if (text === '') {
    return '';
  }
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(text)) {
    const err = new Error(
      'FR-156: invalid stage. Use lowercase alphanumeric segments (e.g. -c stage=dev).',
    );
    err.code = 'A_SEARCH_INVALID_STAGE';
    throw err;
  }
  return `-${text}`;
}

/**
 * @param {string} baseName
 * @param {string} stageSuffix
 * @returns {string}
 */
function withStageSuffix(baseName, stageSuffix) {
  if (!baseName || typeof baseName !== 'string') {
    throw new Error('withStageSuffix: baseName required');
  }
  if (!stageSuffix) return baseName;
  return `${baseName}${stageSuffix}`;
}

/**
 * FR-191: optional region token in physical names for a second regional stack.
 *
 * Context:
 *   includeRegionInNames=true  -> append sanitized -c region= / deployRegion
 *   regionSuffix=euwest1       -> append that token (explicit override)
 *
 * Default (unset): no region token (primary stack names unchanged).
 *
 * @param {Record<string, unknown>} [context]
 * @returns {string} "" or "-euwest2" style suffix
 */
function resolveRegionNameSuffix(context) {
  const ctx = context || {};
  const explicit =
    ctx.regionSuffix !== undefined && ctx.regionSuffix !== null
      ? String(ctx.regionSuffix).trim().toLowerCase()
      : '';
  if (explicit) {
    if (!/^[a-z][a-z0-9]*$/.test(explicit)) {
      const err = new Error(
        'FR-191: invalid regionSuffix. Use lowercase alphanumeric (e.g. -c regionSuffix=euwest1).',
      );
      err.code = 'A_SEARCH_INVALID_REGION_SUFFIX';
      throw err;
    }
    const tok = explicit.replace(/[^a-z0-9]+/g, '');
    if (!tok || !/^[a-z][a-z0-9]*$/.test(tok)) {
      const err = new Error(
        'FR-191: invalid regionSuffix. Use lowercase alphanumeric (e.g. -c regionSuffix=euwest1).',
      );
      err.code = 'A_SEARCH_INVALID_REGION_SUFFIX';
      throw err;
    }
    return `-${tok}`;
  }
  const flag = ctx.includeRegionInNames;
  const on =
    flag === true ||
    flag === 1 ||
    (typeof flag === 'string' &&
      ['true', '1', 'yes', 'on'].includes(flag.trim().toLowerCase()));
  if (!on) return '';
  const regionRaw = ctx.region || ctx.deployRegion || 'eu-west-2';
  const tok = String(regionRaw).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!tok) return '';
  return `-${tok}`;
}

/**
 * FR-156 + FR-191: stage suffix then optional region token.
 * @param {Record<string, unknown>} [context]
 * @returns {string}
 */
function resolveDeployNameSuffix(context) {
  return `${resolveStageSuffix(context)}${resolveRegionNameSuffix(context)}`;
}

/**
 * @param {Record<string, unknown>} [context]
 * @returns {string} ASearchStack or ASearchStack-dev or ASearchStack-standby-euwest1
 */
function resolveStackId(context) {
  const suffix = resolveDeployNameSuffix(context);
  return suffix ? `ASearchStack${suffix}` : 'ASearchStack';
}

module.exports = {
  resolveStageSuffix,
  resolveRegionNameSuffix,
  resolveDeployNameSuffix,
  withStageSuffix,
  resolveStackId,
};
