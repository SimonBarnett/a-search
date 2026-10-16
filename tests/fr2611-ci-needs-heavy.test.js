'use strict';

/**
 * FR-2611: docs/skills-only PRs skip heavy CI; code/main stay heavy.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  isDocsOnlyPath,
  needsHeavy,
} = require('../scripts/ci-needs-heavy.js');

describe('FR-2611 isDocsOnlyPath', () => {
  it('allows docs/, skills/, .grok/skills/, and *.md', () => {
    assert.equal(isDocsOnlyPath('docs/vision.md'), true);
    assert.equal(isDocsOnlyPath('.grok/skills/harvest-agent-skills/SKILL.md'), true);
    assert.equal(isDocsOnlyPath('skills/foo/SKILL.md'), true);
    assert.equal(isDocsOnlyPath('README.md'), true);
    assert.equal(isDocsOnlyPath('AGENTS.md'), true);
    assert.equal(isDocsOnlyPath('providers/foo.md'), true);
  });

  it('rejects code, workflows, lockfiles, and tests', () => {
    assert.equal(isDocsOnlyPath('providers/amazon/handler.js'), false);
    assert.equal(isDocsOnlyPath('.github/workflows/ci.yml'), false);
    assert.equal(isDocsOnlyPath('package.json'), false);
    assert.equal(isDocsOnlyPath('package-lock.json'), false);
    assert.equal(isDocsOnlyPath('tests/fr2611-ci-needs-heavy.test.js'), false);
    assert.equal(isDocsOnlyPath('scripts/ci-needs-heavy.js'), false);
    assert.equal(isDocsOnlyPath('cdk/bin/a-search.js'), false);
  });
});

describe('FR-2611 needsHeavy', () => {
  it('main push is always heavy', () => {
    const r = needsHeavy(['docs/only.md'], {
      eventName: 'push',
      ref: 'refs/heads/main',
    });
    assert.equal(r.heavy, true);
    assert.equal(r.reason, 'main-push');
  });

  it('empty file list fails open (heavy)', () => {
    const r = needsHeavy([], { eventName: 'pull_request' });
    assert.equal(r.heavy, true);
    assert.equal(r.reason, 'no-files-fail-open');
  });

  it('docs/skills-only PR is not heavy', () => {
    const r = needsHeavy(
      [
        'docs/post-install.md',
        '.grok/skills/harvest-agent-skills/SKILL.md',
        'README.md',
      ],
      { eventName: 'pull_request' },
    );
    assert.equal(r.heavy, false);
    assert.equal(r.reason, 'docs-skills-only');
  });

  it('mixed docs+code PR is heavy', () => {
    const r = needsHeavy(
      ['docs/vision.md', 'providers/amazon/handler.js'],
      { eventName: 'pull_request' },
    );
    assert.equal(r.heavy, true);
    assert.equal(r.reason, 'code-paths');
    assert.ok(r.sample.includes('providers/amazon/handler.js'));
  });

  it('workflow-only PR is heavy', () => {
    const r = needsHeavy(['.github/workflows/ci.yml'], {
      eventName: 'pull_request',
    });
    assert.equal(r.heavy, true);
    assert.equal(r.reason, 'code-paths');
  });
});

describe('FR-2611 CLI', () => {
  it('prints heavy=false for docs-only argv files', () => {
    const script = path.join(__dirname, '..', 'scripts', 'ci-needs-heavy.js');
    const r = spawnSync(
      process.execPath,
      [script, '--event', 'pull_request', 'docs/a.md', '.grok/skills/x/SKILL.md'],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /heavy=false/);
    assert.match(r.stdout, /reason=docs-skills-only/);
  });

  it('prints heavy=true for main push even with docs files', () => {
    const script = path.join(__dirname, '..', 'scripts', 'ci-needs-heavy.js');
    const r = spawnSync(
      process.execPath,
      [script, '--event', 'push', '--ref', 'refs/heads/main', 'docs/a.md'],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /heavy=true/);
    assert.match(r.stdout, /reason=main-push/);
  });
});
