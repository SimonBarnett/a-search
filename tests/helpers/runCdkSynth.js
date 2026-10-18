'use strict';

/**
 * FR-365: pin Node >= 18/20 on PATH for CDK `npm run synth` child processes.
 * Marchhare often has Node 8 first on PATH (`Cannot find module 'node:fs'`).
 * FR #3462: private --output dir per synth (allocateSynthOutDir / opts.fresh).
 * FR #3663: default timeout 600s; on timeout kill the whole process tree
 * (shell-only kill left orphan cdk holding cdk.out locks).
 * FR #3764: default runCdkSynth reuses one shared cdk.out-shared-* per stack
 * config (synth once, read-only reuse across test files / batches).
 * #3665 follow-up: no event-loop busy-wait (close never fired, so every synth
 * waited the full 600s). The wait is now a real spawnSync of a node supervisor.
 * Private cdk.out-* dirs are removed at process exit.
 * FR #3763: register cdk.out-* (named + private) for process-exit cleanup.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { registerCdkOutDir } = require('./cdkOutCleanup');

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
 * Descendant pids of rootPid (children first-level, then deeper), POSIX only.
 * Snapshot taken while the root is still alive so re-parented orphans are not
 * lost. Linux: /proc; elsewhere: `ps -A -o pid= -o ppid=`.
 * @param {number} rootPid
 * @returns {number[]}
 */
function listDescendants(rootPid) {
  if (!rootPid || rootPid <= 0 || process.platform === 'win32') return [];
  /** @type {Map<number, number[]>} */
  const kids = new Map();
  const add = (pid, ppid) => {
    if (!Number.isFinite(pid) || !Number.isFinite(ppid)) return;
    if (!kids.has(ppid)) kids.set(ppid, []);
    kids.get(ppid).push(pid);
  };
  let haveTable = false;
  try {
    for (const ent of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(ent)) continue;
      try {
        const stat = fs.readFileSync(`/proc/${ent}/stat`, 'utf8');
        // pid (comm) state ppid ... ; comm may contain spaces/parens.
        const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        add(Number(ent), Number(rest[1]));
        haveTable = true;
      } catch {
        /* process exited mid-scan */
      }
    }
  } catch {
    /* no /proc (macOS) */
  }
  if (!haveTable) {
    const r = spawnSync('ps', ['-A', '-o', 'pid=', '-o', 'ppid='], { encoding: 'utf8' });
    for (const line of String(r.stdout || '').split('\n')) {
      const m = line.trim().match(/^(\d+)\s+(\d+)$/);
      if (m) add(Number(m[1]), Number(m[2]));
    }
  }
  const out = [];
  const seen = new Set([rootPid]);
  const queue = [rootPid];
  while (queue.length) {
    const cur = queue.shift();
    for (const k of kids.get(cur) || []) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
      queue.push(k);
    }
  }
  return out;
}

/**
 * Kill pid and descendants (FR #3663). Windows: taskkill /T /F (walks the
 * tree while the root is alive). POSIX: SIGKILL the process group (root is
 * spawned detached => group leader) plus every descendant found by
 * listDescendants, so a descendant that called setsid() cannot escape.
 * @param {number} pid
 */
function killProcessTree(pid) {
  if (!pid || pid <= 0) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], {
      windowsHide: true,
      encoding: 'utf8',
    });
    return;
  }
  const kill = (target) => {
    try {
      process.kill(target, 'SIGKILL');
    } catch {
      /* already gone / not ours */
    }
  };
  // Snapshot descendants before the root dies (orphans re-parent to init).
  const first = listDescendants(pid);
  kill(-pid);
  kill(pid);
  for (const d of first) kill(d);
  // Second sweep: anything forked between snapshot and kill.
  for (const d of listDescendants(pid)) kill(d);
}

const SUPERVISE_FLAG = '--fr3663-supervise';
const TIMEOUT_EXIT_CODE = 124;
const TIMEOUT_MARKER = '[runCdkSynth] FR-3663 timeout';

/**
 * Supervisor body (runs in its own node process; its event loop is free, so
 * exit and timer events fire normally). Spawns the real command with stdio
 * inherited (output flows straight into the parent's spawnSync pipes), and on
 * timeout kills the whole tree while the root is still alive.
 * @param {{ command: string, args: string[], timeout: number }} spec
 */
function quoteWinArg(value) {
  const text = String(value);
  if (!/[\s"]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function superviseMain(spec) {
  const isWin = process.platform === 'win32';
  const needsCmdShell = isWin && /\.(cmd|bat)$/i.test(spec.command);
  // Windows: .cmd/.bat cannot be spawned without a shell (Node >= 18.20.2).
  // shell:true concatenates unquoted, so "C:\\Program Files\\nodejs\\npm.cmd"
  // and a temp outDir under AppData\\Local become 'C:\\Program' is not recognized.
  // cmd /s strips one outer quote pair; the inner quotes keep paths with spaces.
  const cmdLine = needsCmdShell
    ? `"${[quoteWinArg(spec.command), ...spec.args.map(quoteWinArg)].join(' ')}"`
    : '';
  const child = needsCmdShell
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', cmdLine], {
        stdio: 'inherit',
        windowsHide: true,
        windowsVerbatimArguments: true,
      })
    : spawn(spec.command, spec.args, {
        stdio: 'inherit',
        // POSIX: own process group so killProcessTree can SIGKILL -pid.
        detached: !isWin,
        windowsHide: true,
      });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    process.stderr.write(
      `\n${TIMEOUT_MARKER} after ${spec.timeout}ms; killing process tree pid=${child.pid}\n`,
    );
    killProcessTree(child.pid);
    // Do not wait on stragglers; parent treats this exit code as ETIMEDOUT.
    setTimeout(() => process.exit(TIMEOUT_EXIT_CODE), 200).unref();
  }, spec.timeout);
  child.on('error', (err) => {
    clearTimeout(timer);
    process.stderr.write(`[runCdkSynth] spawn error: ${err && err.message}\n`);
    process.exit(127);
  });
  child.on('exit', (code, sig) => {
    clearTimeout(timer);
    if (timedOut) {
      process.exit(TIMEOUT_EXIT_CODE);
      return;
    }
    if (sig) {
      process.stderr.write(`[runCdkSynth] child killed by ${sig}\n`);
      process.exit(1);
      return;
    }
    process.exit(code == null ? 1 : code);
  });
}

/**
 * Run command synchronously with a wall timeout; on timeout kill the whole
 * process tree (FR #3663). Does NOT block the event loop waiting on async
 * events (the #3665 busy-wait bug): the blocking wait is a real spawnSync of a
 * small node supervisor that owns the timer and the tree kill.
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, env: NodeJS.ProcessEnv, timeout: number }} opts
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
function spawnSyncTreeKill(command, args, opts) {
  const timeout = opts.timeout;
  const spec = JSON.stringify({ command, args, timeout });
  const r = spawnSync(process.execPath, [__filename, SUPERVISE_FLAG, spec], {
    cwd: opts.cwd,
    env: opts.env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    // Backstop only: the supervisor enforces `timeout` itself.
    timeout: timeout + 60_000,
    killSignal: 'SIGKILL',
  });
  const stdout = r.stdout || '';
  const stderr = r.stderr || '';
  let error = r.error || null;
  let status = r.status;
  let signal = r.signal;
  const supervisorTimedOut =
    status === TIMEOUT_EXIT_CODE && stderr.includes(TIMEOUT_MARKER);
  if (supervisorTimedOut || (error && error.code === 'ETIMEDOUT')) {
    const err = new Error(
      `spawnSyncTreeKill timed out after ${timeout}ms; killed process tree`,
    );
    err.code = 'ETIMEDOUT';
    error = err;
    status = null;
    signal = 'SIGTERM';
  }
  return {
    status,
    signal,
    stdout,
    stderr,
    error,
    pid: r.pid,
    output: [null, stdout, stderr],
  };
}

/** Dirs allocated by runCdkSynth in this process; removed on exit (#3462/#3496). */
const allocatedOutDirs = new Set();
let cleanupHooked = false;

function cleanupSynthOutDirs() {
  if (process.env.A_SEARCH_KEEP_CDK_OUT === '1') return;
  for (const dir of allocatedOutDirs) {
    // Only ever our own cdk.out-<pid>-<seq> dirs.
    if (!/^cdk\.out-\d+-\d+$/.test(path.basename(dir))) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* best effort */
    }
  }
  allocatedOutDirs.clear();
}

function trackOutDir(dir) {
  allocatedOutDirs.add(dir);
  if (!cleanupHooked) {
    cleanupHooked = true;
    process.on('exit', cleanupSynthOutDirs);
  }
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
    // FR #3763: named/private out dirs join exit cleanup; shared cache does not (FR #3790).
    registerCdkOutDir(outDir);
  } else if (opts.fresh) {
    outDir = allocateSynthOutDir(root);
    registerCdkOutDir(outDir);
    trackOutDir(outDir);
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
  const app = new cdk.App({
    outdir: outDir,
    context: {
      providerEnvRoot: path.join(root, 'tests', 'fixtures', 'provider-env'),
    },
  });
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
  listDescendants,
  spawnSyncTreeKill,
  cleanupSynthOutDirs,
  runCdkSynth,
  ensureDefaultStackSynth,
  registerCdkOutDir,
};

if (require.main === module && process.argv[2] === SUPERVISE_FLAG) {
  superviseMain(JSON.parse(process.argv[3]));
}
