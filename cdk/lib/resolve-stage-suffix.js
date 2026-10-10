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
 * @param {Record<string, unknown>} [context]
 * @returns {string} ASearchStack or ASearchStack-dev
 */
function resolveStackId(context) {
  const suffix = resolveStageSuffix(context);
  return suffix ? `ASearchStack${suffix}` : 'ASearchStack';
}

module.exports = {
  resolveStageSuffix,
  withStageSuffix,
  resolveStackId,
};
