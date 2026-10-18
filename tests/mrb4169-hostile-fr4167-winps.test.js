'use strict';

/**
 * MRB #4169 hostile pins for FR #4167 WinPS 5.1 folder download.
 * Prove: --args-env handoff, env cleared on bad JSON, no feedurl on argv,
 * Invoke-FolderDownload never passes JSON argv, one AWS_PROFILE for the run.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const tools = path.join(root, 'tools');
const runner = path.join(tools, 'run-folder-download.js');
const { loadArgs } = require('../tools/run-folder-download.js');

const FAKE_FEED =
  'https://example.invalid/feed.csv.gz?apikey=FAKE_feed_key_4167_only';

describe('MRB #4169 hostile FR #4167 WinPS', () => {
  it('Invoke-FolderDownload uses --args-env and never passes JSON as native argv', () => {
    const text = fs.readFileSync(
      path.join(tools, 'Invoke-FolderDownload.ps1'),
      'utf8',
    );
    assert.match(text, /A_SEARCH_FOLDER_DOWNLOAD_ARGS/);
    assert.match(text, /'--args-env'|\"--args-env\"/);
    assert.match(text, /\$node \$runner '--args-env'/);
    // Must not invoke node with the compressed JSON string as argv[2]
    assert.doesNotMatch(
      text,
      /\& \$node \$runner \$jsonArgs/,
      'legacy WinPS-mangling argv JSON handoff must stay gone',
    );
    assert.doesNotMatch(text, /\& \$node \$runner \$argsObj/);
  });

  it('Invoke-FolderDownload sets process AWS_PROFILE for meta+writes and restores it', () => {
    const text = fs.readFileSync(
      path.join(tools, 'Invoke-FolderDownload.ps1'),
      'utf8',
    );
    assert.match(text, /Resolve-FolderDownloadAwsProfile/);
    assert.match(
      text,
      /SetEnvironmentVariable\('AWS_PROFILE',\s*\$profile,\s*'Process'\)/,
    );
    assert.match(
      text,
      /GetEnvironmentVariable\('AWS_PROFILE',\s*'Process'\)/,
    );
    // restore previous or clear in finally
    assert.match(text, /prevAwsProfile/);
    assert.ok(
      /SetEnvironmentVariable\('AWS_PROFILE',\s*\$null/.test(text) ||
        /SetEnvironmentVariable\('AWS_PROFILE',\s*\$prevAwsProfile/.test(text),
      'must restore or clear AWS_PROFILE after the run',
    );
  });

  it('loadArgs --args-env clears env even when JSON is invalid', () => {
    process.env.A_SEARCH_FOLDER_DOWNLOAD_ARGS = '{not-json';
    let threw = null;
    try {
      loadArgs(['node', runner, '--args-env'], process.env);
    } catch (err) {
      threw = err;
    }
    assert.ok(threw, 'expected throw');
    assert.equal(threw.code, 'invalid_json_args');
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        process.env,
        'A_SEARCH_FOLDER_DOWNLOAD_ARGS',
      ),
      false,
      'env must be cleared even on parse failure (secret dwell)',
    );
  });

  it('argv JSON handoff would leak feedurl; --args-env does not', () => {
    const probe = path.join(os.tmpdir(), `mrb4169-probe-${process.pid}.js`);
    const outArgv = path.join(os.tmpdir(), `mrb4169-argv-${process.pid}.txt`);
    const json = JSON.stringify({
      provider: 'awin',
      affiliateId: 'aff1',
      bucket: 'a-affiliates',
      dryRun: true,
      affiliateMeta: { feedurl: FAKE_FEED },
    });
    fs.writeFileSync(
      probe,
      [
        "'use strict';",
        "const fs = require('fs');",
        "fs.writeFileSync(process.env.MRB4169_OUT, process.argv.slice(2).join('\\0'), 'utf8');",
        '',
      ].join('\n'),
      'utf8',
    );
    try {
      // Hostile: proving the anti-pattern still leaks if used
      const leak = spawnSync(process.execPath, [probe, json], {
        env: { ...process.env, MRB4169_OUT: outArgv },
        encoding: 'utf8',
      });
      assert.equal(leak.status, 0, leak.stderr);
      const leaked = fs.readFileSync(outArgv, 'utf8');
      assert.ok(
        leaked.includes('FAKE_feed_key_4167_only'),
        'control: argv JSON must expose the feed key (why --args-env exists)',
      );

      // Safe path
      fs.unlinkSync(outArgv);
      const safe = spawnSync(process.execPath, [probe, '--args-env'], {
        env: {
          ...process.env,
          MRB4169_OUT: outArgv,
          A_SEARCH_FOLDER_DOWNLOAD_ARGS: json,
        },
        encoding: 'utf8',
      });
      assert.equal(safe.status, 0, safe.stderr);
      const cmdline = fs.readFileSync(outArgv, 'utf8');
      assert.ok(cmdline.includes('--args-env'));
      assert.ok(!cmdline.includes('FAKE_feed_key_4167_only'));
      assert.ok(!cmdline.includes(FAKE_FEED));
      assert.ok(!cmdline.includes('feedurl'));
    } finally {
      for (const p of [probe, outArgv]) {
        try {
          fs.unlinkSync(p);
        } catch {
          /* ignore */
        }
      }
    }
  });

  it('README documents WinPS args-env and single AWS identity', () => {
    const readme = fs.readFileSync(
      path.join(tools, 'README-folder-tools.md'),
      'utf8',
    );
    assert.match(readme, /A_SEARCH_FOLDER_DOWNLOAD_ARGS/);
    assert.match(readme, /--args-env/);
    assert.match(readme, /WinPS 5\.1|Windows PowerShell 5\.1/);
    assert.match(readme, /AWS_PROFILE/);
    assert.match(readme, /A_SEARCH_AGENTS_AWS_PROFILE/);
    assert.match(readme, /same identity|one profile|One AWS identity/i);
  });

  it('shims download/meta/search end with exit $LASTEXITCODE as last meaningful line', () => {
    for (const name of ['download.ps1', 'meta.ps1', 'search.ps1']) {
      const lines = fs
        .readFileSync(path.join(tools, name), 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
      assert.ok(lines.length >= 2, name);
      assert.match(
        lines[lines.length - 1],
        /^exit\s+\$LASTEXITCODE$/,
        `${name} last executable line must be exit $LASTEXITCODE`,
      );
    }
  });
});
