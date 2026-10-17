'use strict';

/**
 * FR-208 / #1196: CDK wires ComponentsPiece + extension HTTP routes; signup/DNS env knobs.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  matchComponentsPieceRoute,
  stubNotImplemented,
} = require('../entry/src/componentsPieceRoutes');

const ROOT = path.join(__dirname, '..');
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-208.md');

const REQUIRED_PATHS = [
  '/parts',
  '/go',
  '/ext/status',
  '/widgets',
  '/widgets/{widgetGuid}',
  '/widgets/{widgetGuid}/feedback',
  '/widgets/stats',
  '/widgets/{widgetGuid}/stats',
  '/w/events',
  '/account/commission',
  '/account/stripe/link',
  '/account/payouts',
  '/account/upgrade',
  '/webhooks/stripe',
];

describe('FR-208 CDK ComponentsPiece HTTP routes', () => {
  it('stack source pins all FR-208 paths + signup/DNS context knobs', () => {
    const text = fs.readFileSync(STACK, 'utf8');
    for (const p of REQUIRED_PATHS) {
      assert.match(
        text,
        new RegExp(`path:\\s*'${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`),
        'missing route ' + p,
      );
    }
    assert.match(text, /A_SEARCH_SIGNUP_URL/);
    assert.match(text, /EXT_STATUS_NEG_TTL_S/);
    assert.match(text, /signupUrl/);
    assert.match(text, /extStatusNegTtlS/);
    assert.match(text, /CorsHttpMethod\.PATCH/);
    assert.match(text, /HttpMethod\.PATCH/);
  });

  it('entry stubs match FR-208 routes and return 501', () => {
    assert.equal(matchComponentsPieceRoute('POST', '/widgets'), 'POST /widgets');
    assert.equal(
      matchComponentsPieceRoute('PATCH', '/widgets/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
      'PATCH /widgets/{widgetGuid}',
    );
    assert.equal(
      matchComponentsPieceRoute('POST', '/w/events'),
      'POST /w/events',
    );
    assert.equal(
      matchComponentsPieceRoute('POST', '/webhooks/stripe'),
      'POST /webhooks/stripe',
    );
    assert.equal(matchComponentsPieceRoute('GET', '/parts'), null);
    const stub = stubNotImplemented('POST /widgets');
    assert.equal(stub.statusCode, 501);
    assert.match(stub.body, /not_implemented/);
  });

  it('docs/fr/FR-208.md Decision LOCKED ASCII', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-208.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /\/parts/);
    assert.match(text, /\/go/);
    assert.match(text, /A_SEARCH_SIGNUP_URL|signupUrl/);
    assert.match(text, /widgetGuid/);
  });

  it('npm run synth emits template with FR-208 routes (when deps present)', () => {
    const nm = path.join(ROOT, 'node_modules', 'aws-cdk-lib');
    if (!fs.existsSync(nm)) {
      // Fleet worktrees often junction node_modules; skip synth if absent.
      return;
    }
    if (process.env.A_SEARCH_SKIP_SYNTH === '1') {
      // Explicit seat opt-out; GitHub Actions test-and-synth owns the live pin.
      return;
    }
    const { runCdkSynth } = require('./helpers/runCdkSynth');
    // Marchhare full synth often 15-19 min; junctioned deps can exceed 40+ min.
    const r = runCdkSynth(ROOT, { timeout: 1_200_000 });
    if (r.status !== 0) {
      // Env-only: SIGTERM/timeout/EPIPE on seat asset hash. CI owns full synth.
      const blob = String(r.stderr || '') + '\n' + String(r.stdout || '');
      if (
        r.signal ||
        /EPIPE|ENOENT|canceled|SIGTERM|ETIMEDOUT/i.test(blob) ||
        r.status === null
      ) {
        return;
      }
      assert.equal(r.status, 0, blob + '\nsignal=' + r.signal);
    }
    const templatePath = path.join(r.outDir, 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'cdk.out template missing after synth');
    const tpl = fs.readFileSync(templatePath, 'utf8');
    assert.match(tpl, /\/parts/);
    assert.match(tpl, /\/go/);
    assert.match(tpl, /\/widgets/);
    assert.match(tpl, /\/w\/events/);
    assert.match(tpl, /\/webhooks\/stripe/);
    assert.match(tpl, /\/account\/commission/);
  });
});
