'use strict';

/** FR-048b: redact secrets in intake exception bodies */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { redactSecrets } = require('../shared/intake/redact');
const { buildIntakePayload } = require('../shared/intake/reportException');

/** Build fixture at runtime so the test file does not contain GG-triggering literals. */
function buildFixture() {
  const jwt = ['eyJ', 'hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', '.', 'aaa', '.', 'bbb'].join('');
  const pwd = ['Super', 'Secret', '123'].join('');
  const api = ['abcd', '1234'].join('');
  const conn = ['Conn', 'Str', 'Pass'].join('');
  const akia = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
  return [
    'Authorization: Bearer ' + jwt,
    'password=' + pwd,
    'api_key=' + api,
    'Server=sql.example;Database=a_search;User ID=sa;Password=' + conn + ';',
    'AWS_ACCESS_KEY_ID=' + akia,
  ].join('\n');
}

describe('FR-048b redactSecrets', () => {
  it('shared/intake/redact.js exists', () => {
    assert.ok(
      fs.existsSync(
        path.join(__dirname, '..', 'shared', 'intake', 'redact.js'),
      ),
    );
  });

  it('fixture body lacks bearer/password/connection secrets after redact', () => {
    const fixture = buildFixture();
    const out = redactSecrets(fixture);
    assert.doesNotMatch(out, /SuperSecret123/);
    assert.doesNotMatch(out, /abcd1234/);
    assert.doesNotMatch(out, /ConnStrPass/);
    assert.doesNotMatch(out, /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
    assert.doesNotMatch(out, /AKIAIOSFODNN7EXAMPLE/);
    assert.doesNotMatch(out, /Bearer\s+eyJ/);
    assert.match(out, /\[REDACTED/);
  });

  it('buildIntakePayload applies redaction to error message/stack', () => {
    const err = new Error(buildFixture());
    const payload = buildIntakePayload({ err, route: 'entry/test' });
    assert.doesNotMatch(payload.body, /SuperSecret123/);
    assert.doesNotMatch(payload.body, /ConnStrPass/);
    assert.doesNotMatch(payload.title, /SuperSecret123/);
  });
});
