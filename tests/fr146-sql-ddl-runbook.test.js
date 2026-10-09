'use strict';

/**
 * FR-146: ops runbook — create sandbox DB + apply maintainer/sql DDL.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const runbook = path.join(root, 'docs', 'sql', 'apply-ddl-runbook.md');

describe('FR-146 SQL DDL apply runbook', () => {
  it('runbook documents create DB + apply 001-003 to live and sandbox', () => {
    assert.ok(fs.existsSync(runbook), 'docs/sql/apply-ddl-runbook.md missing');
    const text = fs.readFileSync(runbook, 'utf8');
    assert.match(text, /FR-146/);
    assert.match(text, /a_search_sandbox/);
    assert.match(text, /RECOVERY SIMPLE/);
    assert.match(text, /madeiradb/);
    assert.match(text, /001_PartFeedKeys\.sql/);
    assert.match(text, /002_Parts\.sql/);
    assert.match(text, /003_PartsStaging\.sql/);
    assert.match(text, /sqlcmd/);
    assert.match(text, /<mssql-host>/);
    assert.match(text, /never|password|secret/i);
    assert.doesNotMatch(text, /password\s*=\s*['"][^'"]+['"]/i);
  });

  it('environments + maintainer README + gap + FR-146 Decision LOCKED', () => {
    const env = fs.readFileSync(path.join(root, 'docs', 'environments.md'), 'utf8');
    assert.match(env, /a_search_sandbox/);
    assert.match(env, /apply-ddl-runbook\.md/);
    assert.match(env, /FR-146/);

    const maint = fs.readFileSync(
      path.join(root, 'maintainer', 'sql', 'README.md'),
      'utf8',
    );
    assert.match(maint, /apply-ddl-runbook\.md/);
    assert.match(maint, /FR-146/);

    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-146.md'), 'utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /a_search_sandbox/);
    assert.match(fr, /fr146-sql-ddl-runbook\.test\.js/);

    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-aws-installable-2026-10-09.md'),
      'utf8',
    );
    assert.match(
      gap,
      /\|\s*Sandbox DB create \+ DDL apply runbook\s*\|\s*\*\*Yes\*\*/,
    );
  });
});
