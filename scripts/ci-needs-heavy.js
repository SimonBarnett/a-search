'use strict';

/**
 * FR-2611: classify whether CI must run the heavy suite (npm test + optional synth)
 * on the self-hosted whiterabbit runner.
 *
 * Docs/skills-only PRs (docs/**, .grok/skills/**, skills/**, *.md) return heavy=false
 * so the required check `test-and-synth` can pass on ubuntu-latest in seconds.
 * Main pushes and any non-docs path keep heavy=true (fail-open on empty/missing lists).
 */

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function isDocsOnlyPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const n = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!n || n === '.') return false;
  if (n.startsWith('docs/')) return true;
  if (n.startsWith('.grok/skills/')) return true;
  if (n.startsWith('skills/')) return true;
  if (n.endsWith('.md')) return true;
  return false;
}

/**
 * @param {string[]} files
 * @param {{ eventName?: string, ref?: string }} [opts]
 * @returns {{ heavy: boolean, reason: string, sample?: string[] }}
 */
function needsHeavy(files, opts = {}) {
  const eventName = opts.eventName || '';
  const ref = opts.ref || '';
  if (eventName === 'push' && ref === 'refs/heads/main') {
    return { heavy: true, reason: 'main-push' };
  }
  const list = Array.isArray(files)
    ? files.map((f) => String(f || '').trim()).filter(Boolean)
    : [];
  if (list.length === 0) {
    return { heavy: true, reason: 'no-files-fail-open' };
  }
  const nonDocs = list.filter((f) => !isDocsOnlyPath(f));
  if (nonDocs.length === 0) {
    return { heavy: false, reason: 'docs-skills-only' };
  }
  return {
    heavy: true,
    reason: 'code-paths',
    sample: nonDocs.slice(0, 8),
  };
}

function parseArgs(argv) {
  const out = { eventName: '', ref: '', files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--event' && argv[i + 1]) {
      out.eventName = argv[++i];
    } else if (a === '--ref' && argv[i + 1]) {
      out.ref = argv[++i];
    } else if (a === '--stdin') {
      const fs = require('node:fs');
      const text = fs.readFileSync(0, 'utf8');
      out.files.push(
        ...text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean),
      );
    } else if (!a.startsWith('-')) {
      out.files.push(a);
    }
  }
  return out;
}

function writeGithubOutput(result) {
  const fs = require('node:fs');
  const line = (k, v) => `${k}=${v}\n`;
  const body =
    line('heavy', result.heavy ? 'true' : 'false') + line('reason', result.reason);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, body, 'utf8');
  }
  process.stdout.write(body);
}

function main(argv) {
  const args = parseArgs(argv);
  const result = needsHeavy(args.files, {
    eventName: args.eventName || process.env.GITHUB_EVENT_NAME || '',
    ref: args.ref || process.env.GITHUB_REF || '',
  });
  writeGithubOutput(result);
  return result.heavy ? 0 : 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { isDocsOnlyPath, needsHeavy, parseArgs, main };
