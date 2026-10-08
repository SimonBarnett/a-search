'use strict';

/**
 * MRB #925 hostile pins for FR-120 Parts vs MerchantProducts decision.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { isMissingTableError } = require('../shared/mssql/isMissingTableError');
const {
  classifyMssqlConnectError,
} = require('../shared/mssql/classifyConnectError');

describe('MRB-925 FR-120 hostile', () => {
  it('parts-maintainer Decision (a): own dbo.Parts; reject MerchantProducts search path', () => {
    const text = fs.readFileSync(path.join(root, 'docs', 'parts-maintainer.md'), 'utf8');
    assert.match(text, /## Decision \(FR-120\)/);
    assert.match(text, /Chosen:\s*\(a\)/i);
    assert.match(text, /dbo\.Parts/);
    assert.match(text, /PartFeedKeys/);
    assert.match(text, /PartsStaging/);
    assert.match(text, /Rejected:\s*\(b\)/i);
    assert.match(text, /MerchantProducts/);
    assert.match(text, /missing_table/);
    assert.match(text, /no runtime DDL|never DDL|ops apply/i);
  });

  it('awin/impact queryParts + probes target dbo.Parts; keep FR-119+120 error codes', () => {
    for (const id of ['awin', 'impact']) {
      const qp = fs.readFileSync(
        path.join(root, 'providers', 'local', id, 'src', 'queryParts.js'),
        'utf8',
      );
      assert.match(qp, /dbo\.Parts/, id + ' queryParts');
      assert.doesNotMatch(qp, /FROM\s+dbo\.MerchantProducts/i, id);
      const probe = fs.readFileSync(
        path.join(root, 'providers', 'local', id, 'src', 'selftestProbe.js'),
        'utf8',
      );
      assert.match(probe, /isMissingTableError/, id);
      assert.match(probe, /classifyMssqlConnectError/, id);
      assert.match(probe, /missing_table/, id);
      assert.match(probe, /FROM dbo\.Parts/, id);
    }
  });

  it('isMissingTableError detects 208 / Invalid object name; classifier still distinct', () => {
    assert.equal(isMissingTableError({ number: 208, message: 'Invalid object name' }), true);
    assert.equal(
      isMissingTableError({ message: "Invalid object name 'dbo.Parts'." }),
      true,
    );
    assert.equal(isMissingTableError({ code: 'ESOCKET', message: 'Failed to connect' }), false);
    assert.equal(classifyMssqlConnectError({ code: 'ESOCKET' }), 'mssql_unreachable');
    assert.equal(classifyMssqlConnectError({ code: 'ELOGIN' }), 'mssql_auth_failed');
  });

  it('shared README lists both mssql helpers; data-model/vision cite FR-120', () => {
    const readme = fs.readFileSync(path.join(root, 'shared', 'README.md'), 'utf8');
    assert.match(readme, /isMissingTableError/);
    assert.match(readme, /classifyConnectError/);
    const dm = fs.readFileSync(path.join(root, 'docs', 'data-model.md'), 'utf8');
    assert.match(dm, /FR-120/);
    const vision = fs.readFileSync(path.join(root, 'docs', 'vision.md'), 'utf8');
    assert.match(vision, /FR-120|dbo\.Parts/);
  });
});
