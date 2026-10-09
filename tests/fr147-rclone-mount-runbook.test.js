'use strict';

/**
 * FR-147: installable rclone mount runbook section in docs/rclone-results.md.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('FR-147 rclone mount runbook', () => {
  it('rclone-results.md has FR-147 step-by-step mount + verify needles', () => {
    const text = fs.readFileSync(
      path.join(root, 'docs', 'rclone-results.md'),
      'utf8',
    );
    assert.match(text, /Installable mount runbook \(FR-147\)/);
    assert.match(text, /FR-147/);
    assert.match(text, /rclone config|rclone lsd|rclone mount/);
    assert.match(text, /A_SEARCH_RCLONE_ROOT/);
    assert.match(text, /\bX:\\/);
    assert.match(text, /live\\/);
    assert.match(text, /sandbox\\/);
    assert.match(text, /reboot|scheduled task|Windows service/i);
    assert.match(text, /verify|Confirm a known `searchId`|Expected file/i);
    assert.match(text, /out of scope|never commit/i);
    // Keep FR-124 locks
    assert.match(text, /FR-124/);
    assert.doesNotMatch(text, /A_SEARCH_RCLONE_ROOT=S:\\/);
  });

  it('deploy.md cross-links FR-147; Decision LOCKED; release-gap Yes', () => {
    const deploy = fs.readFileSync(path.join(root, 'docs', 'deploy.md'), 'utf8');
    assert.match(deploy, /rclone-results\.md/);
    assert.match(deploy, /FR-147/);

    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-147.md'), 'utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /fr147-rclone-mount-runbook\.test\.js/);

    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-aws-installable-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /\|\s*rclone SQL-host runbook\s*\|\s*\*\*Yes\*\*/);
  });
});
