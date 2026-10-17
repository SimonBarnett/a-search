'use strict';

/**
 * FR-365: pin Node >= 18/20 on PATH for CDK `npm run synth` child processes.
 * Marchhare often has Node 8 first on PATH (`Cannot find module 'node:fs'`).
 * FR #3462: private --output dir per synth (allocateSynthOutDir / opts.fresh).
 * FR #3663: default timeout 600s; on timeout kill the whole process tree
 * (shell-only kill left orphan cdk holding cdk.out locks).
 * FR #3764: default runCdkSynth reuses one shared cdk.out-shared-* per stack
 * config (synth once, read-only reuse across test files / batches).
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const MIN_MAJOR = 18;

/** Default CDK synth wall-clock budget (ms). FR #3663. */
const DEFAULT_SYNTH_TIMEOUT_MS = 600_000;

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

let synthSeq = 0;

/** Default shared cache key for the stock ASearchStack synth (FR #3764). */
const DEFAULT_SHARED_SYNTH_KEY = 'default';

/**
 * FR #3462: a private cdk.out-* directory so parallel synths do not share one lock.
 * @param {string} root
 * @returns {string}
 */
function allocateSynthOutDir(root) {
  synthSeq += 1;
  return path.join(root, `cdk.out-${process.pid}-${synthSeq}`);
}

/**
 * FR #3764: stable shared output dir for one stack config (survives test batches).
 * @param {string} root
 * @param {string} [key]
 * @returns {string}
 */
function sharedSynthOutDir(root, key = DEFAULT_SHARED_SYNTH_KEY) {
  const safe = String(key || DEFAULT_SHARED_SYNTH_KEY)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || DEFAULT_SHARED_SYNTH_KEY;
  return path.join(root, `cdk.out-shared-${safe}`);
}

/**
 * @param {string} outDir
 * @returns {boolean}
 */
function synthArtifactReady(outDir) {
  if (!outDir) return false;
  try {
    return fs.existsSync(path.join(outDir, 'ASearchStack.template.json'));
  } catch {
    return false;
  }
}

/**
 * @param {string} outDir
 * @returns {string[]}
 */
function synthNpmArgs(outDir) {
  return ['run', 'synth', '--', '--output', outDir];
}

/**
 * Kill pid and descendants. Windows: taskkill /T. Unix: process group then pid.
 * @param {number} pid
 */
function killProcessTree(pid) {
  if (!pid || pid <= 0) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      encoding: 'utf8',
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

/**
 * Brief sleep without busy-spinning the event loop forever (sync helper).
 * @param {number} ms
 */
function sleepMs(ms) {
  const n = Math.max(1, Math.min(ms, 200));
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
  } catch {
    spawnSync(process.execPath, ['-e', `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${n})`], {
      timeout: n + 50,
      windowsHide: true,
    });
  }
}

/**
 * Spawn + wait with wall timeout; on timeout kill the whole tree (FR #3663).
 * Prefer shell:false so the npm process is the direct child (Unix process group).
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, env: NodeJS.ProcessEnv, timeout: number }} opts
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function spawnSyncTreeKill(command, args, opts) {
  const timeout = opts.timeout;
  const isWin = process.platform === 'win32';
  const child = spawn(command, args, {
    cwd: opts.cwd,
    env: opts.env,
    // Windows: npm.cmd needs no shell when invoked with .cmd path; shell:false
    // keeps taskkill able to target the npm tree. Unix: detached => process group.
    shell: false,
    detached: !isWin,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  if (child.stdout) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
  }
  if (child.stderr) {
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
  }

  let settled = false;
  let status = null;
  let signal = null;
  /** @type {Error|null} */
  let error = null;
  child.on('error', (err) => {
    error = err;
    settled = true;
  });
  child.on('close', (code, sig) => {
    status = code;
    signal = sig;
    settled = true;
  });

  const deadline = Date.now() + timeout;
  while (!settled && Date.now() < deadline) {
    sleepMs(50);
  }

  if (!settled) {
    killProcessTree(child.pid);
    const graceUntil = Date.now() + 5000;
    while (!settled && Date.now() < graceUntil) {
      sleepMs(50);
    }
    const err = new Error(
      `spawnSyncTreeKill timed out after ${timeout}ms; killed process tree pid=${child.pid}`,
    );
    err.code = 'ETIMEDOUT';
    error = err;
    if (status == null) status = null;
    if (signal == null) signal = 'SIGTERM';
  }

  return {
    status,
    signal,
    stdout,
    stderr,
    error,
    pid: child.pid,
    output: [null, stdout, stderr],
  };
}

/**
 * Run `npm run synth` with PATH pinned so stage-entry + cdk --app node use Node 20+.
 * FR #3764: unless opts.outDir or opts.fresh, reuse cdk.out-shared-* when ready.
 * @param {string} root repo root
 * @param {{ timeout?: number, outDir?: string, fresh?: boolean, cacheKey?: string }} [opts]
 * @returns {import('node:child_process').SpawnSyncReturns<string> & { nodeBin?: string|null, skipped?: boolean, outDir?: string, reused?: boolean }}
 */
function runCdkSynth(root, opts = {}) {
  let outDir;
  let reused = false;
  if (opts.outDir) {
    outDir = opts.outDir;
  } else if (opts.fresh) {
    outDir = allocateSynthOutDir(root);
  } else {
    outDir = sharedSynthOutDir(root, opts.cacheKey || DEFAULT_SHARED_SYNTH_KEY);
    if (synthArtifactReady(outDir)) {
      reused = true;
      return {
        status: 0,
        stdout: '',
        stderr: '',
        pid: 0,
        output: [null, '', ''],
        signal: null,
        error: null,
        nodeBin: resolveNodeBin(),
        skipped: false,
        reused: true,
        outDir,
      };
    }
  }

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
      reused: false,
      outDir,
    };
  }
  const timeout = opts.timeout ?? DEFAULT_SYNTH_TIMEOUT_MS;
  const npmCmd =
    process.platform === 'win32'
      ? path.join(path.dirname(nodeBin), 'npm.cmd')
      : 'npm';
  const cmd = fs.existsSync(npmCmd) ? npmCmd : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSyncTreeKill(cmd, synthNpmArgs(outDir), {
    cwd: root,
    timeout,
    env: envWithPinnedNode(nodeBin),
  });
  r.nodeBin = nodeBin;
  r.outDir = outDir;
  r.reused = reused;
  return r;
}

/**
 * FR #3764: in-process default ASearchStack synth once into the shared out dir.
 * @param {string} root
 * @param {{ fresh?: boolean, outDir?: string, cacheKey?: string, stackProps?: object }} [opts]
 * @returns {{ outDir: string, reused: boolean }}
 */
function ensureDefaultStackSynth(root, opts = {}) {
  let outDir;
  if (opts.outDir) {
    outDir = opts.outDir;
  } else if (opts.fresh) {
    outDir = allocateSynthOutDir(root);
  } else {
    outDir = sharedSynthOutDir(root, opts.cacheKey || DEFAULT_SHARED_SYNTH_KEY);
    if (synthArtifactReady(outDir)) {
      return { outDir, reused: true };
    }
  }
  // Lazy require so non-CDK unit tests do not load aws-cdk-lib.
  const cdk = require('aws-cdk-lib');
  const { ASearchStack } = require(path.join(root, 'cdk', 'lib', 'a-search-stack'));
  fs.mkdirSync(outDir, { recursive: true });
  const app = new cdk.App({ outdir: outDir });
  new ASearchStack(app, 'ASearchStack', opts.stackProps);
  app.synth();
  return { outDir, reused: false };
}

module.exports = {
  MIN_MAJOR,
  DEFAULT_SYNTH_TIMEOUT_MS,
  DEFAULT_SHARED_SYNTH_KEY,
  candidateNodeBins,
  nodeMajor,
  resolveNodeBin,
  envWithPinnedNode,
  allocateSynthOutDir,
  sharedSynthOutDir,
  synthArtifactReady,
  synthNpmArgs,
  killProcessTree,
  spawnSyncTreeKill,
  runCdkSynth,
  ensureDefaultStackSynth,
};
