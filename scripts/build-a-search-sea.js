'use strict';

/**
 * FR #4827: esbuild bundle + node --experimental-sea-config + postject.
 * Writes dist/sea/a-annotator.exe, dist/sea/a-sqlsearch.exe,
 * dist/sea/a-searches.exe, and dist/sea/a-hasresults-monitor.exe (FR #4918).
 *
 * On Windows the host node.exe is copied. On Linux/macOS the matching
 * win-x64 node.exe is downloaded from nodejs.org (same version as this process,
 * because the SEA blob and the injected binary must match).
 *
 * --smoke: require the NODE_SEA fuse in each exe. On win32 also run --version
 * and require exit 0. On other platforms execution is skipped (PE will not run).
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'sea');
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const TARGETS = [
  {
    name: 'a-annotator',
    entry: path.join(ROOT, 'scripts', 'sea', 'annotator-entry.js'),
  },
  {
    name: 'a-sqlsearch',
    entry: path.join(ROOT, 'scripts', 'sea', 'sqlsearch-entry.js'),
  },
  {
    name: 'a-searches',
    entry: path.join(ROOT, 'scripts', 'sea', 'searches-entry.js'),
  },
  {
    name: 'a-hasresults-monitor',
    entry: path.join(ROOT, 'scripts', 'sea', 'hasresults-monitor-entry.js'),
  },
];

function download(url, dest, redirectsLeft) {
  const left = redirectsLeft == null ? 5 : redirectsLeft;
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        if (left <= 0) {
          reject(new Error(`redirect_limit:${url}`));
          return;
        }
        const next = new URL(res.headers.location, url).toString();
        download(next, dest, left - 1).then(resolve, reject);
        return;
      }
      if (code !== 200) {
        res.resume();
        reject(new Error(`download_failed:${code}:${url}`));
        return;
      }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(dest)));
      out.on('error', reject);
    });
    req.on('error', reject);
  });
}

/**
 * Windows node binary whose version equals process.version.
 * @returns {Promise<string>}
 */
async function resolveWindowsNodeBinary() {
  if (process.platform === 'win32') return process.execPath;
  const ver = process.versions.node;
  const dest = path.join(DIST, `node-v${ver}-win-x64.exe`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000000) return dest;
  const url = `https://nodejs.org/dist/v${ver}/win-x64/node.exe`;
  process.stdout.write(`downloading ${url}\n`);
  await download(url, dest);
  return dest;
}

async function bundleOne(target) {
  const esbuild = require('esbuild');
  const outfile = path.join(DIST, `${target.name}.cjs`);
  await esbuild.build({
    entryPoints: [target.entry],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile,
    logLevel: 'info',
    external: ['msnodesqlv8', 'mssql/msnodesqlv8'],
  });
  return outfile;
}

function buildBlob(bundlePath, blobPath) {
  const cfgPath = `${blobPath}.sea-config.json`;
  const cfg = {
    main: bundlePath,
    output: blobPath,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
  };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg), 'utf8');
  // The annotator bundle pulls in the AWS SDK. Default heap Zone-OOMs while
  // writing the SEA blob (Node 24). Give the prep step a 4 GiB old space.
  const env = { ...process.env };
  if (!/--max-old-space-size=/.test(String(env.NODE_OPTIONS || ''))) {
    env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --max-old-space-size=4096`.trim();
  }
  const r = spawnSync(process.execPath, ['--experimental-sea-config', cfgPath], {
    cwd: ROOT,
    encoding: 'utf8',
    env,
  });
  if (r.status !== 0) {
    throw new Error(
      `sea_config_failed:${r.status}:${r.stderr || r.stdout || ''}`,
    );
  }
  if (!fs.existsSync(blobPath)) throw new Error(`blob_missing:${blobPath}`);
}

async function injectBlob(exePath, blobPath) {
  const postject = require('postject');
  const inject = postject.inject || (postject.default && postject.default.inject);
  if (typeof inject !== 'function') throw new Error('postject_inject_missing');
  const blob = fs.readFileSync(blobPath);
  await inject(exePath, 'NODE_SEA_BLOB', blob, {
    sentinelFuse: FUSE,
    overwrite: true,
  });
}

function smokeExe(exePath, name) {
  const buf = fs.readFileSync(exePath);
  if (buf.indexOf(Buffer.from(FUSE)) < 0) {
    throw new Error(`fuse_missing:${name}`);
  }
  if (process.platform !== 'win32') {
    process.stdout.write(
      `${JSON.stringify({
        smoke: 'fuse_ok',
        exe: name,
        note: 'exec_skipped_non_windows',
      })}\n`,
    );
    return;
  }
  const r = spawnSync(exePath, ['--version'], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`version_failed:${name}:${r.status}:${r.stderr || r.stdout || ''}`);
  }
  if (String(r.stdout).indexOf(name) === -1) {
    throw new Error(`version_banner:${name}:${r.stdout}`);
  }
  process.stdout.write(String(r.stdout));
}

async function main() {
  const smoke = process.argv.indexOf('--smoke') !== -1;
  fs.mkdirSync(DIST, { recursive: true });
  const nodeBinary = await resolveWindowsNodeBinary();
  for (let i = 0; i < TARGETS.length; i += 1) {
    const target = TARGETS[i];
    const bundlePath = await bundleOne(target);
    const blobPath = path.join(DIST, `${target.name}.blob`);
    const exePath = path.join(DIST, `${target.name}.exe`);
    buildBlob(bundlePath, blobPath);
    fs.copyFileSync(nodeBinary, exePath);
    await injectBlob(exePath, blobPath);
    process.stdout.write(`built ${exePath}\n`);
    if (smoke) smokeExe(exePath, target.name);
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${err && err.message ? err.message : err}\n`);
    process.exit(1);
  });
}

module.exports = {
  FUSE,
  TARGETS,
  DIST,
  resolveWindowsNodeBinary,
  main,
};
