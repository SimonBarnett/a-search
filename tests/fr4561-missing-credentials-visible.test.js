'use strict';

/**
 * FR #4561: *_missing_credentials must ERROR-log (provider + searchid, no secrets),
 * ERROR-log and ack/delete the SQS message (no retry / no DLQ). FR #4823: no status IN.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  handleSqsWith429,
  isMissingProviderCreds,
  isNonRetryableProviderSkip,
} = require('../shared/search/handleSqsWith429');
const { buildInResult, validateInResult } = require('../shared/search/inResultSchema');

function credsErr(code) {
  const err = new Error(code);
  err.name = 'ProviderCredsError';
  err.code = code;
  return err;
}

describe('FR #4561 IN schema status error field', () => {
  it('buildInResult / validateInResult pass through error', () => {
    const body = buildInResult({
      searchid: 'srch_1',
      source: 'cj',
      hostkey: 'mmfc.example',
      guid: 'guid-1',
      products: [],
      error: 'missing_credentials',
    });
    assert.equal(body.error, 'missing_credentials');
    assert.deepEqual(body.products, []);
    const v = validateInResult(body);
    assert.equal(v.ok, true);
    assert.equal(v.value.error, 'missing_credentials');
  });
});

describe('FR #4561 missing_credentials visibility', () => {
  it('recognises missing_credentials skip class (FR #4769: other nonRetryable -> DLQ)', () => {
    assert.equal(isMissingProviderCreds(credsErr('cj_missing_credentials')), true);
    assert.equal(isNonRetryableProviderSkip(credsErr('kelkoo_missing_credentials')), true);
    const marked = new Error('vendor');
    marked.code = 'vendor_bad_request';
    marked.nonRetryable = true;
    // API faults are no longer an ack/skip class (FR #4769).
    assert.equal(isNonRetryableProviderSkip(marked), false);
    assert.equal(isNonRetryableProviderSkip(new Error('boom')), false);
  });

  it('ERROR-logs provider+searchid, no status IN, acks message (FR #4823)', async () => {
    const logs = [];
    /** @type {Array<{Key:string,Body:Buffer}>} */
    const puts = [];
    const out = await handleSqsWith429({
      event: {
        Records: [
          {
            body: JSON.stringify({
              searchid: 'srch_677ea35b21e320ef2f63',
              hostkey: 'mmfc.example',
              guid: 'widget-guid-1',
              env: 'live',
              source: 'cj',
            }),
            receiptHandle: 'rh-cj',
          },
        ],
      },
      run: async () => {
        throw credsErr('cj_missing_credentials');
      },
      deps: {
        putObject: async (args) => {
          puts.push(args);
          return {};
        },
        touchLastmod: async () => {},
      },
      logError: (...args) => {
        logs.push(args.map(String).join(' '));
      },
      reportException: async () => {
        throw new Error('intake must not run for missing creds');
      },
      route: 'providers/live/cj/handler',
      source: 'cj',
    });

    assert.equal(out.ok, true);
    assert.equal(out.results.length, 1);
    assert.equal(out.results[0].skipped, 'missing_credentials');
    assert.equal(out.results[0].code, 'cj_missing_credentials');

    assert.equal(logs.length, 1);
    assert.match(logs[0], /missing_credentials/i);
    assert.match(logs[0], /\bcj\b/);
    assert.match(logs[0], /srch_677ea35b21e320ef2f63/);
    assert.match(logs[0], /cj_missing_credentials/);
    assert.doesNotMatch(logs[0], /password|secret|Bearer|api[_-]?key=/i);

    // FR #5198: missing_credentials is terminal _search-done/ (still no IN/ or GUID DONE/).
    const inPuts = puts.filter((p) => /\/IN\//i.test(String(p.Key || '')));
    assert.equal(inPuts.length, 0);
    assert.ok(puts.some((p) => String(p.Key || '').startsWith('_search-done/')));
    assert.equal(
      puts.some((p) => /\/DONE\//i.test(String(p.Key || ''))),
      false,
    );
  });

  it('nonRetryable provider API error throws to DLQ without IN (FR #4769)', async () => {
    const puts = [];
    const err = new Error('bad context');
    err.code = 'invalid_context';
    err.nonRetryable = true;
    await assert.rejects(
      () =>
        handleSqsWith429({
          event: {
            Records: [
              {
                body: JSON.stringify({
                  searchid: 'srch_x',
                  hostkey: 'host1',
                  guid: 'g1',
                }),
                receiptHandle: 'rh-x',
              },
            ],
          },
          run: async () => {
            throw err;
          },
          deps: {
            putObject: async (args) => {
              puts.push(args);
              return {};
            },
            touchLastmod: async () => {},
          },
          logError: () => {},
          source: 'kelkoo',
        }),
      (e) => e === err,
    );
    assert.equal(puts.length, 0);
  });

  it('still acks when IN path incomplete (log only)', async () => {
    const logs = [];
    const puts = [];
    const out = await handleSqsWith429({
      event: {
        Records: [
          {
            body: JSON.stringify({ searchId: 'legacy-s1', env: 'live' }),
            receiptHandle: 'rh-legacy',
          },
        ],
      },
      run: async () => {
        throw credsErr('kelkoo_missing_credentials');
      },
      deps: {
        putObject: async (args) => {
          puts.push(args);
          return {};
        },
      },
      logError: (...args) => {
        logs.push(args.join(' '));
      },
      source: 'kelkoo',
    });
    assert.equal(out.ok, true);
    assert.equal(out.results[0].skipped, 'missing_credentials');
    assert.equal(logs.length, 1);
    assert.match(logs[0], /srch_|legacy-s1|searchid/i);
    // No a-clubs IN path without hostkey+guid — do not invent a legacy results write.
    assert.equal(puts.length, 0);
  });
});
