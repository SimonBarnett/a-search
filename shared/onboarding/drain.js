'use strict';

/**
 * Local onboarding drain orchestrator (FR-049b).
 * Loops runOnce until remaining===0 or maxIterations safety cap.
 * Provider runOnce bodies are out of scope.
 *
 * @see docs/onboarding-agents.md (FR-049a)
 */

class DrainError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'DrainError';
    this.code = code;
  }
}

const DEFAULT_MAX_ITERATIONS = 100;

/**
 * @param {object} opts
 * @param {(deps?: object) => Promise<{ processed?: number, remaining: number, signups?: object[] }>} opts.runOnce
 * @param {object} [opts.deps] - forwarded to each runOnce call
 * @param {number} [opts.maxIterations]
 * @returns {Promise<{
 *   ok: boolean,
 *   drained: boolean,
 *   capped: boolean,
 *   iterations: number,
 *   processed: number,
 *   remaining: number,
 *   signups: object[],
 * }>}
 */
async function drain(opts = {}) {
  const runOnce = opts.runOnce;
  if (typeof runOnce !== 'function') {
    throw new DrainError('missing_runOnce', 'drain requires opts.runOnce');
  }

  let maxIterations = opts.maxIterations;
  if (maxIterations == null) maxIterations = DEFAULT_MAX_ITERATIONS;
  maxIterations = Number(maxIterations);
  if (!Number.isFinite(maxIterations) || maxIterations < 1) {
    throw new DrainError(
      'invalid_maxIterations',
      'maxIterations must be a positive number',
    );
  }

  const deps = opts.deps;
  const signups = [];
  let processed = 0;
  let remaining = -1;
  let iterations = 0;
  let capped = false;

  while (iterations < maxIterations) {
    iterations += 1;
    const tick = await runOnce(deps);
    if (!tick || typeof tick !== 'object') {
      throw new DrainError(
        'invalid_runOnce_result',
        'runOnce must return an object with remaining',
      );
    }
    if (typeof tick.remaining !== 'number' || !Number.isFinite(tick.remaining)) {
      throw new DrainError(
        'invalid_remaining',
        'runOnce.remaining must be a finite number',
      );
    }
    remaining = tick.remaining;
    if (typeof tick.processed === 'number' && Number.isFinite(tick.processed)) {
      processed += tick.processed;
    }
    if (Array.isArray(tick.signups)) {
      for (const row of tick.signups) signups.push(row);
    }
    if (remaining === 0) {
      return {
        ok: true,
        drained: true,
        capped: false,
        iterations,
        processed,
        remaining: 0,
        signups,
      };
    }
  }

  capped = true;
  return {
    ok: false,
    drained: false,
    capped,
    iterations,
    processed,
    remaining,
    signups,
  };
}

module.exports = {
  drain,
  DrainError,
  DEFAULT_MAX_ITERATIONS,
};
