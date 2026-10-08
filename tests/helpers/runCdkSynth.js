'use strict';

/**
 * FR-365: pin Node >= 18/20 on PATH for CDK `npm run synth` child processes.
 * Marchhare often has Node 8 first on PATH (`Cannot find module 'node:fs'`).
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MIN_MAJOR = 18;

/** @returns {string[]} */
function candidateNodeBins() {
  const out = [];
  const envPin = process.env.A_SEARCH_NODE_BIN || process.env.NODE_BIN;
  if (envPin) out.push(envPin);
  out.push(
    path.join('D:', 'Tools', 'node', 'node.exe'),
    path.join('D:', 'tools', 'node', 'node.exe'),
    process.execPath,
  );
  return out;
}

/**
 * @param {string} nodePath
 * @returns {number}
 */
function nodeMajor(nodePath) {
  const r = spawnSync(nodePath, ['-p', 'process.versions.node'], {
    encoding: 'utf8',
  });
  if (r.status !== 0) return 0;
  const m = String(r.stdout || '')
    .trim()
    .match(/^(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * First existing Node binary with major >= MIN_MAJOR.
 * @returns {string|null}
 */
function resolveNodeBin() {
  for (const cand of candidateNodeBins()) {
    if (!cand || !fs.existsSync(cand)) continue;
    if (nodeMajor(cand) >= MIN_MAJOR) return path.resolve(cand);
  }
  return null;
}

/**
 * @param {string} nodeBin
 * @param {NodeJS.ProcessEnv} [base]
 * @returns {NodeJS.ProcessEnv}
 */
function envWithPinnedNode(nodeBin, base = process.env) {
  const dir = path.dirname(nodeBin);
  const sep = path.delimiter;
  const prev = base.PATH || base.Path || '';
  return { ...base, PATH: `${dir}${sep}${prev}` };
}

/**
 * Run `npm run synth` with PATH pinned so stage-entry + cdk --app node use Node 20+.
 * @param {string} root repo root
 * @param {{ timeout?: number }} [opts]
 * @returns {import('node:child_process').SpawnSyncReturns<string> & { nodeBin?: string|null, skipped?: boolean }}
 */
function runCdkSynth(root, opts = {}) {
  const nodeBin = resolveNodeBin();
  if (!nodeBin) {
    return {
      status: 1,
      stdout: '',
      stderr: `No Node >= ${MIN_MAJOR} for CDK synth (set A_SEARCH_NODE_BIN). Tried: ${candidateNodeBins().join(', ')}`,
      pid: 0,
      output: ['', '', ''],
      signal: null,
      error: new Error('node too old for CDK synth'),
      nodeBin: null,
      skipped: true,
    };
  }
  const timeout = opts.timeout ?? 180_000;
  const r = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'synth'],
    {
      cwd: root,
      encoding: 'utf8',
      shell: true,
      timeout,
      env: envWithPinnedNode(nodeBin),
    },
  );
  r.nodeBin = nodeBin;
  return r;
}

module.exports = {
  MIN_MAJOR,
  candidateNodeBins,
  nodeMajor,
  resolveNodeBin,
  envWithPinnedNode,
  runCdkSynth,
};