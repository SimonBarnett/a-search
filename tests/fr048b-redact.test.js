'use strict';

/** FR-048b: redact secrets in intake exception bodies */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { redactSecrets } = require('../shared/intake/redact');
const { buildIntakePayload } = require('../shared/intake/reportException');
const {
  redactFixtureBody,
  fakePassword,
  fakeApiKey,
  fakeConnPassword,
  fakeJwtHeaderPayload,
  fakeAwsExampleAccessKey,
  reLiteral,
  reFromParts,
} = require('./fixtures/fakeSecrets');

describe('FR-048b redactSecrets', () => {
  it('shared/intake/redact.js exists', () => {
    assert.ok(
      fs.existsSync(
        path.join(__dirname, '..', 'shared', 'intake', 'redact.js'),
      ),
    );
  });

  it('fixture body lacks bearer/password/connection secrets after redact', () => {
    const fixture = redactFixtureBody();
    const out = redactSecrets(fixture);
    assert.doesNotMatch(out, reLiteral(fakePassword()));
    assert.doesNotMatch(out, reLiteral(fakeApiKey()));
    assert.doesNotMatch(out, reLiteral(fakeConnPassword()));
    assert.doesNotMatch(out, reLiteral(fakeJwtHeaderPayload()));
    assert.doesNotMatch(out, reLiteral(fakeAwsExampleAccessKey()));
    assert.doesNotMatch(out, reFromParts(['Bearer', '\\s+', 'eyJ']));
    assert.match(out, /\[REDACTED/);
  });

  it('buildIntakePayload applies redaction to error message/stack', () => {
    const err = new Error(redactFixtureBody());
    const payload = buildIntakePayload({ err, route: 'entry/test' });
    assert.doesNotMatch(payload.body, reLiteral(fakePassword()));
    assert.doesNotMatch(payload.body, reLiteral(fakeConnPassword()));
    assert.doesNotMatch(payload.title, reLiteral(fakePassword()));
  });
});
