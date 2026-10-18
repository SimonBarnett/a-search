'use strict';

/**
 * Hostile pins for MRB #3133 / FR-2611: docs/skills-only CI skip keeps
 * required check test-and-synth green without a whiterabbit slot.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'ci.yml');
const scriptPath = path.join(root, 'scripts', 'ci-needs-heavy.js');
const {
  needsHeavy,
  isDocsOnlyPath,
} = require('../scripts/ci-needs-heavy.js');

describe('MRB3133 FR-2611 workflow contract', () => {
  const yml = fs.readFileSync(workflowPath, 'utf8').replace(/\r\n/g, '\n');

  it('keeps required job id test-and-synth and cheap classify on ubuntu-latest', () => {
    assert.match(yml, /\n {2}classify:\n/);
    assert.match(yml, /\n {2}test-and-synth:\n/);
    assert.match(yml, /classify:[\s\S]*?runs-on:\s*ubuntu-latest/);
    assert.match(yml, /needs:\s*classify/);
    assert.match(yml, /Docs\/skills-only skip \(FR-2611\)/);
    assert.match(
      yml,
      /timeout-minutes:\s*\$\{\{\s*needs\.classify\.outputs\.heavy == 'true' && 180 \|\| 5\s*\}\}/,
    );
    assert.match(
      yml,
      /runs-on:\s*\$\{\{\s*needs\.classify\.outputs\.heavy != 'true' && 'ubuntu-latest'/,
    );
    // classify block itself must not schedule on self-hosted / whiterabbit.
    const classifyBlock = yml.split(/\n {2}test-and-synth:\n/)[0];
    assert.match(classifyBlock, /\n {2}classify:\n/);
    assert.doesNotMatch(classifyBlock, /self-hosted/);
  });

  it('wires classify to ci-needs-heavy.js with --stdin on pull_request', () => {
    assert.match(
      yml,
      /scripts\/ci-needs-heavy\.js --event push --ref refs\/heads\/main/,
    );
    assert.match(
      yml,
      /node scripts\/ci-needs-heavy\.js --event pull_request --stdin/,
    );
    assert.match(yml, /heavy=true reason=missing-pr-shas/);
  });
});

describe('MRB3133 FR-2611 stdin + fail-open pins', () => {
  it('CLI --stdin docs-only prints heavy=false', () => {
    const r = spawnSync(
      process.execPath,
      [scriptPath, '--event', 'pull_request', '--stdin'],
      {
        encoding: 'utf8',
        input: 'docs/a.md\n.grok/skills/harvest-agent-skills/SKILL.md\n',
      },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /heavy=false/);
    assert.match(r.stdout, /reason=docs-skills-only/);
  });

  it('CLI --stdin mixed code prints heavy=true', () => {
    const r = spawnSync(
      process.execPath,
      [scriptPath, '--event', 'pull_request', '--stdin'],
      {
        encoding: 'utf8',
        input: 'docs/a.md\nproviders/amazon/handler.js\n',
      },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /heavy=true/);
    assert.match(r.stdout, /reason=code-paths/);
  });

  it('writes GITHUB_OUTPUT when env is set', () => {
    const outFile = path.join(
      os.tmpdir(),
      `mrb3133-gh-out-${process.pid}-${Date.now()}.txt`,
    );
    try {
      const r = spawnSync(
        process.execPath,
        [scriptPath, '--event', 'pull_request', 'README.md'],
        {
          encoding: 'utf8',
          env: { ...process.env, GITHUB_OUTPUT: outFile },
        },
      );
      assert.equal(r.status, 0, r.stderr);
      const body = fs.readFileSync(outFile, 'utf8');
      assert.match(body, /heavy=false/);
      assert.match(body, /reason=docs-skills-only/);
    } finally {
      fs.unlinkSync(outFile);
    }
  });

  it('backslash paths normalize as docs-only', () => {
    assert.equal(isDocsOnlyPath('.grok\\skills\\x\\SKILL.md'), true);
    const r = needsHeavy(['docs\\post-install.md'], {
      eventName: 'pull_request',
    });
    assert.equal(r.heavy, false);
    assert.equal(r.reason, 'docs-skills-only');
  });
});
