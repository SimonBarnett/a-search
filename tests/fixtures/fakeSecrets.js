'use strict';

/**
 * Runtime-built secret-shaped fixtures for tests (GitGuardian-safe).
 * Never store contiguous Bearer/JWT/password literals in test sources —
 * assemble from parts here (bobiverse#3304 / a-search FR).
 */

function joinParts(parts) {
  return (parts || []).join('');
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** RegExp matching the exact runtime string (parts joined). */
function reLiteral(value, flags = '') {
  return new RegExp(escapeRe(value), flags);
}

/** RegExp from string parts (no contiguous literal in caller source). */
function reFromParts(parts, flags = '') {
  return new RegExp(joinParts(parts.map(escapeRe)), flags);
}

/** Dummy HS256 JWT header payload fragment (AWS-doc style nonsense). */
function fakeJwtHeaderPayload() {
  return joinParts(['eyJ', 'hbGciOi', 'JIUzI1NiIsInR5cCI6IkpXVCJ9']);
}

/** Short dummy JWT header used in selftest intake fixtures. */
function fakeJwtHeaderShort() {
  return joinParts(['eyJ', 'hbGciOi', 'JIUzI1NiJ9']);
}

/** Full dummy three-part JWT (header.aaa.bbb). */
function fakeDummyJwt() {
  return joinParts([fakeJwtHeaderPayload(), '.', 'aaa', '.', 'bbb']);
}

function fakeDummyJwtShort() {
  return joinParts([fakeJwtHeaderShort(), '.', 'x', '.', 'y']);
}

function fakePassword() {
  return joinParts(['Super', 'Secret', '123']);
}

function fakeApiKey() {
  return joinParts(['abcd', '1234']);
}

function fakeConnPassword() {
  return joinParts(['Conn', 'Str', 'Pass']);
}

/** AWS documentation example access key (known-ignored by many scanners). */
function fakeAwsExampleAccessKey() {
  return joinParts(['AKIA', 'IOSFODNN7EXAMPLE']);
}

function fakeBearerTokenPlain() {
  return joinParts(['SECRET', 'TOKEN']);
}

function fakeHunterPassword() {
  return joinParts(['hunt', 'er2']);
}

function authorizationBearer(token) {
  return joinParts(['Authorization: ', 'Bearer ', token]);
}

function passwordAssignment(pwd) {
  return joinParts(['password', '=', pwd]);
}

/**
 * Multi-line body used by FR-048b redact / buildIntakePayload tests.
 */
function redactFixtureBody() {
  const jwt = fakeDummyJwt();
  const pwd = fakePassword();
  const api = fakeApiKey();
  const conn = fakeConnPassword();
  const akia = fakeAwsExampleAccessKey();
  return [
    authorizationBearer(jwt),
    passwordAssignment(pwd),
    joinParts(['api_key', '=', api]),
    joinParts([
      'Server=sql.example;Database=a_search;User ID=sa;Password=',
      conn,
      ';',
    ]),
    joinParts(['AWS_ACCESS_KEY_ID', '=', akia]),
  ].join('\n');
}

/**
 * Single-line Authorization + password blob for reportException redaction.
 */
function reportExceptionSecretMessage() {
  return [
    authorizationBearer(fakeBearerTokenPlain()),
    passwordAssignment(fakeHunterPassword()),
  ].join(' ');
}

/**
 * Selftest intake secret line (Bearer + short JWT).
 */
function selftestBearerSecret() {
  return joinParts(['Bearer ', fakeDummyJwtShort()]);
}

module.exports = {
  joinParts,
  escapeRe,
  reLiteral,
  reFromParts,
  fakeJwtHeaderPayload,
  fakeJwtHeaderShort,
  fakeDummyJwt,
  fakeDummyJwtShort,
  fakePassword,
  fakeApiKey,
  fakeConnPassword,
  fakeAwsExampleAccessKey,
  fakeBearerTokenPlain,
  fakeHunterPassword,
  authorizationBearer,
  passwordAssignment,
  redactFixtureBody,
  reportExceptionSecretMessage,
  selftestBearerSecret,
};
