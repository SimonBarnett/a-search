'use strict';

/**
 * FR #4223: grok 1.0.62 rejects --prompt / --output text (exit 2).
 * Pin argv and a fake binary that rejects those flags.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  tryGrokCli,
  tryCursorCli,
  grokReviewArgv,
} = require('../redqueen/src/reviewers');

function writeFakeGrok(dir) {
  const script = path.join(dir, 'fake-grok.js');
  const argvOut = path.join(dir, 'argv.txt');
  fs.writeFileSync(
    script,
    [
      "'use strict';",
      'const fs = require("fs");',
      `const out = ${JSON.stringify(argvOut)};`,
      'const argv = process.argv.slice(2);',
      'fs.writeFileSync(out, argv.join("\\n"), "utf8");',
      'const joined = argv.join(" ");',
      'if (argv.includes("--prompt") || argv.includes("--output")) {',
      '  process.stderr.write("error: unexpected argument \'--prompt\' found\\n");',
      '  process.exit(2);',
      '}',
      'if (argv.includes("--output-format")) {',
      '  const i = argv.indexOf("--output-format");',
      '  if (argv[i + 1] === "text") {',
      '    process.stderr.write("error: invalid value \'text\' for \'--output-format\'\\n");',
      '    process.exit(2);',
      '  }',
      '}',
      'if (argv.includes("-p") || argv.includes("--prompt-file")) {',
      '  if (argv.includes("--output-format") && argv.includes("plain")) {',
      '    process.stdout.write("{\\"summary\\":\\"ok\\"}\\n");',
      '    process.exit(0);',
      '  }',
      '}',
      'process.stderr.write("error: missing -p\\n");',
      'process.exit(2);',
      '',
    ].join('\n'),
    'utf8',
  );
  return { argvOut, script };
}

describe('FR #4223 reviewer CLI flags', () => {
  it('grokReviewArgv uses -p and --output-format plain, never --prompt', () => {
    const argv = grokReviewArgv('hello');
    assert.ok(argv.includes('-p'));
    assert.ok(argv.includes('--output-format'));
    assert.ok(argv.includes('plain'));
    assert.ok(argv.includes('--disable-web-search'));
    assert.equal(argv.includes('--prompt'), false);
    assert.equal(argv.includes('--output'), false);
  });

  it('long prompts use --prompt-file', () => {
    const argv = grokReviewArgv('x'.repeat(5000), 'C:\\tmp\\p.txt');
    assert.ok(argv.includes('--prompt-file'));
    assert.equal(argv.includes('-p'), false);
    assert.equal(argv.includes('--prompt'), false);
  });

  it('fake grok 1.0.62 accepts -p --output-format plain and rejects --prompt', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4223-'));
    const fake = writeFakeGrok(dir);
    const prev = process.env.A_SEARCH_GROK_BIN;
    const prevScript = process.env.A_SEARCH_GROK_NODE_SCRIPT;
    process.env.A_SEARCH_GROK_BIN = 'node';
    process.env.A_SEARCH_GROK_NODE_SCRIPT = fake.script;
    try {
      const bad = spawnSync(process.execPath, [fake.script, '--prompt', 'x', '--output', 'text'], {
        encoding: 'utf8',
      });
      assert.equal(bad.status, 2);

      const r = tryGrokCli({ prompt: 'Reply OK', timeoutMs: 15000 });
      assert.equal(r.ok, true, r.detail);
      const seen = fs.readFileSync(fake.argvOut, 'utf8');
      assert.match(seen, /-p/);
      assert.match(seen, /--output-format/);
      assert.match(seen, /plain/);
      assert.equal(seen.includes('--prompt'), false);
    } finally {
      if (prev == null) delete process.env.A_SEARCH_GROK_BIN;
      else process.env.A_SEARCH_GROK_BIN = prev;
      if (prevScript == null) delete process.env.A_SEARCH_GROK_NODE_SCRIPT;
      else process.env.A_SEARCH_GROK_NODE_SCRIPT = prevScript;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exit 2 detail includes first stderr line', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4223-err-'));
    const script = path.join(dir, 'bad.js');
    fs.writeFileSync(
      script,
      "process.stderr.write('error: unexpected argument found\\n'); process.exit(2);\n",
      'utf8',
    );
    const prev = process.env.A_SEARCH_GROK_BIN;
    const prevScript = process.env.A_SEARCH_GROK_NODE_SCRIPT;
    process.env.A_SEARCH_GROK_BIN = 'node';
    process.env.A_SEARCH_GROK_NODE_SCRIPT = script;
    try {
      const r = tryGrokCli({ prompt: 'x', timeoutMs: 15000 });
      assert.equal(r.ok, false);
      assert.match(r.detail, /^grok_exit_2:/);
      assert.match(r.detail, /unexpected argument/);
    } finally {
      if (prev == null) delete process.env.A_SEARCH_GROK_BIN;
      else process.env.A_SEARCH_GROK_BIN = prev;
      if (prevScript == null) delete process.env.A_SEARCH_GROK_NODE_SCRIPT;
      else process.env.A_SEARCH_GROK_NODE_SCRIPT = prevScript;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('agent.exe under .grok\\bin is not treated as Cursor', () => {
    const prev = process.env.A_SEARCH_CURSOR_BIN;
    process.env.A_SEARCH_CURSOR_BIN =
      'C:\\Users\\Administrator\\.grok\\bin\\agent.exe';
    try {
      const r = tryCursorCli({ prompt: 'x', timeoutMs: 1000 });
      assert.equal(r.ok, false);
      assert.equal(r.detail, 'cursor_is_grok_bin');
    } finally {
      if (prev == null) delete process.env.A_SEARCH_CURSOR_BIN;
      else process.env.A_SEARCH_CURSOR_BIN = prev;
    }
  });
});
