'use strict';

/**
 * FR #4167: WinPS 5.1 JSON args via env; feed URL never on node command line.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const runner = path.join(__dirname, '..', 'tools', 'run-folder-download.js');

describe('fr4167 run-folder-download args handoff', () => {
  it('loadArgs reads --args-env and clears A_SEARCH_FOLDER_DOWNLOAD_ARGS', () => {
    // Require after stubbing: export loadArgs from runner
    const mod = require('../tools/run-folder-download.js');
    assert.equal(typeof mod.loadArgs, 'function');
    const secret =
      'https://example.test/feed?key=SECRETLEAK4167';
    const json = JSON.stringify({
      provider: 'awin',
      affiliateId: 'aff1',
      bucket: 'a-affiliates',
      dryRun: true,
      affiliateMeta: { feedurl: secret, format: 'csv' },
    });
    process.env.A_SEARCH_FOLDER_DOWNLOAD_ARGS = json;
    const args = mod.loadArgs(['node', runner, '--args-env'], process.env);
    assert.equal(args.provider, 'awin');
    assert.equal(args.affiliateMeta.feedurl, secret);
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        process.env,
        'A_SEARCH_FOLDER_DOWNLOAD_ARGS',
      ),
      false,
    );
  });

  it('spawned command line with --args-env contains no feedurl metadata', () => {
    const secret = 'https://example.test/feed?key=SECRETLEAK4167';
    const json = JSON.stringify({
      provider: 'awin',
      affiliateId: 'aff1',
      bucket: 'a-affiliates',
      dryRun: true,
      affiliateMeta: { feedurl: secret, format: 'csv' },
    });
    const probe = path.join(
      __dirname,
      'fixtures',
      'fr4167-probe-argv.js',
    );
    fs.mkdirSync(path.dirname(probe), { recursive: true });
    fs.writeFileSync(
      probe,
      [
        "'use strict';",
        "const fs = require('fs');",
        "const out = process.argv.slice(2).join('\\0');",
        "fs.writeFileSync(process.env.FR4167_ARGV_OUT, out, 'utf8');",
        'process.exit(0);',
        '',
      ].join('\n'),
      'utf8',
    );
    const argvOut = path.join(
      require('os').tmpdir(),
      `fr4167-argv-${process.pid}.txt`,
    );
    try {
      if (fs.existsSync(argvOut)) fs.unlinkSync(argvOut);
      const r = spawnSync(process.execPath, [probe, '--args-env'], {
        env: {
          ...process.env,
          A_SEARCH_FOLDER_DOWNLOAD_ARGS: json,
          FR4167_ARGV_OUT: argvOut,
        },
        encoding: 'utf8',
      });
      assert.equal(r.status, 0, r.stderr || r.stdout);
      const cmdline = fs.readFileSync(argvOut, 'utf8');
      assert.ok(cmdline.includes('--args-env'));
      assert.ok(!cmdline.includes(secret));
      assert.ok(!cmdline.includes('SECRETLEAK4167'));
      assert.ok(!cmdline.includes('feedurl'));
      assert.ok(!cmdline.includes('affiliateMeta'));
    } finally {
      try {
        fs.unlinkSync(argvOut);
      } catch {
        /* ignore */
      }
    }
  });

  it('tools shims exit LASTEXITCODE (source check)', () => {
    const root = path.join(__dirname, '..', 'tools');
    for (const name of ['download.ps1', 'meta.ps1', 'search.ps1']) {
      const text = fs.readFileSync(path.join(root, name), 'utf8');
      assert.match(
        text,
        /exit\s+\$LASTEXITCODE/,
        `${name} must exit $LASTEXITCODE`,
      );
    }
  });

  it('FolderS3 get-object helpers use FR #4087 Continue + LASTEXITCODE', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'tools', 'FolderS3.ps1'),
      'utf8',
    );
    assert.match(text, /function Get-FolderS3TextObject/);
    // FR #5174: aws argv is @('--profile', ..., 's3api', 'get-object', '--bucket', ...)
    // not a single 'aws s3api get-object --bucket' string. Still require Continue + LASTEXITCODE.
    const getObjectIdx = text.indexOf(
      "'s3api', 'get-object', '--bucket'",
    );
    const rcloneCatIdx = text.indexOf('rclone cat');
    const getAnnIdx = text.indexOf(
      "'s3api', 'get-object-annotation', '--bucket'",
    );
    assert.ok(getObjectIdx > 0, 'get-object argv needle missing');
    assert.ok(rcloneCatIdx > 0, 'rclone cat needle missing');
    assert.ok(getAnnIdx > 0, 'get-object-annotation argv needle missing');
    for (const idx of [getObjectIdx, rcloneCatIdx, getAnnIdx]) {
      const window = text.slice(Math.max(0, idx - 320), idx + 220);
      assert.match(
        window,
        /\$ErrorActionPreference\s*=\s*'Continue'/,
        'native call missing Continue wrapper near offset ' + idx,
      );
      assert.match(window, /\$LASTEXITCODE/, 'native call missing LASTEXITCODE');
    }
    // FR #5174: get-object / get-object-annotation argv always include --profile
    for (const idx of [getObjectIdx, getAnnIdx]) {
      const window = text.slice(Math.max(0, idx - 120), idx + 80);
      assert.match(
        window,
        /@\('--profile'/,
        'aws argv missing --profile near offset ' + idx,
      );
    }
  });
});
