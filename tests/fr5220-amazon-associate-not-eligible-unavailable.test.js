'use strict';

/**
 * FR #5220: AssociateNotEligible is provider_unavailable — ack, no IN, no DLQ,
 * terminal serviced products=0, WARN provider_unavailable.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  isCreatorsNotEligible,
  isAmazonPermanentVendorFault,
  isImmediateDlqFault,
  isProviderFaultForDlq,
} = (() => {
  const backoff = require('../shared/search/backoff429');
  const handle = require('../shared/search/handleSqsWith429');
  return {
    isCreatorsNotEligible: backoff.isCreatorsNotEligible,
    isAmazonPermanentVendorFault: backoff.isAmazonPermanentVendorFault,
    isImmediateDlqFault: handle.isImmediateDlqFault,
    isProviderFaultForDlq: handle.isProviderFaultForDlq,
  };
})();
const { handleSqsWith429 } = require('../shared/search/handleSqsWith429');
const { classifyCreatorsHttpFault } = require('../providers/live/amazon/src/creatorsSearch');

const body403 = JSON.stringify({
  message: 'Your account does not currently meet the eligibility requirements.',
  reason: 'AssociateNotEligible',
  type: 'AccessDeniedException',
});

function eligibleErr() {
  const err = new Error(
    'Amazon Creators HTTP 403: Your account does not currently meet the eligibility requirements.',
  );
  err.status = 403;
  err.statusCode = 403;
  err.code = 'creators_not_eligible';
  err.nonRetryable = true;
  err.body = JSON.parse(body403);
  return err;
}

describe('FR #5220 AssociateNotEligible provider_unavailable', () => {
  it('classify still tags AssociateNotEligible', () => {
    assert.equal(
      classifyCreatorsHttpFault(403, JSON.parse(body403), body403),
      'creators_not_eligible',
    );
  });

  it('creators_not_eligible is unavailable helper, not permanent DLQ fault', () => {
    const err = eligibleErr();
    assert.equal(isCreatorsNotEligible(err), true);
    assert.equal(isAmazonPermanentVendorFault(err), false);
    assert.equal(isProviderFaultForDlq(err), false);
    assert.equal(isImmediateDlqFault(err), false);
  });

  it('handleSqsWith429 acks: no IN, no DLQ send, terminal _search-done serviced, WARN log', async () => {
    const puts = [];
    const sends = [];
    const deletes = [];
    const logs = [];
    const err = eligibleErr();

    const out = await handleSqsWith429({
      event: {
        Records: [
          {
            body: JSON.stringify({
              searchId: 'srch_5220',
              searchid: 'srch_5220',
              env: 'live',
              userId: 'U1',
              host: 'example.test',
              hostkey: 'example.test',
              guid: 'g-5220',
              source: 'amazon',
            }),
            receiptHandle: 'rh-5220',
            attributes: { ApproximateReceiveCount: '1', MessageGroupId: 'amazon' },
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
      },
      sendMessage: async (args) => {
        sends.push(args);
        return {};
      },
      deleteMessage: async (args) => {
        deletes.push(args);
        return {};
      },
      queueUrl: 'https://sqs.example/amazon.fifo',
      dlqUrl: 'https://sqs.example/a-search-provider-amazon-live-dlq.fifo',
      logError: (...parts) => {
        logs.push(parts.join(' '));
      },
      source: 'amazon',
      reportException: async () => {
        throw new Error('intake must not run for eligibility gate');
      },
    });

    assert.equal(out.ok, true);
    assert.equal(out.results.length, 1);
    assert.equal(out.results[0].skipped, 'provider_unavailable');
    assert.equal(out.results[0].code, 'creators_not_eligible');

    const inPuts = puts.filter((p) => String(p.Key || '').includes('/IN/'));
    assert.equal(inPuts.length, 0, 'no IN write');

    const donePuts = puts.filter((p) =>
      String(p.Key || '').startsWith('_search-done/'),
    );
    assert.ok(donePuts.length >= 1, 'terminal _search-done written');
    const body = JSON.parse(String(donePuts[0].Body || '{}'));
    assert.equal(body.status, 'serviced');
    assert.equal(body.products, 0);
    assert.match(String(donePuts[0].Key), /_search-done\/srch_5220\/amazon\.json/);

    assert.equal(sends.length, 0, 'no DLQ SendMessage');
    // ack path does not need delete when Lambda returns success without throw
    assert.equal(deletes.length, 0);

    const warn = logs.find((l) => /provider_unavailable/.test(l));
    assert.ok(warn, 'WARN provider_unavailable logged');
    assert.match(warn, /WARN/);
    assert.match(warn, /reason=AssociateNotEligible/);
    assert.match(warn, /provider=amazon/);
    assert.match(warn, /searchid=srch_5220/);
    assert.ok(!/provider_failure/.test(warn));
    assert.ok(!/ERROR/.test(warn.split('provider_unavailable')[0]));
  });

  it('other 403 unknown reason still DLQs (regression)', async () => {
    const puts = [];
    const sends = [];
    const deletes = [];
    const err = new Error('Amazon Creators HTTP 403: AccessDenied');
    err.status = 403;
    err.statusCode = 403;
    err.code = 'creators_http_403';
    err.nonRetryable = true;

    const out = await handleSqsWith429({
      event: {
        Records: [
          {
            body: JSON.stringify({
              searchId: 'srch_other403',
              host: 'example.test',
              guid: 'g-other',
              source: 'amazon',
            }),
            receiptHandle: 'rh-other',
            attributes: { ApproximateReceiveCount: '1', MessageGroupId: 'amazon' },
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
      },
      sendMessage: async (args) => {
        sends.push(args);
        return { MessageId: 'm1' };
      },
      deleteMessage: async (args) => {
        deletes.push(args);
        return {};
      },
      queueUrl: 'https://sqs.example/amazon.fifo',
      dlqUrl: 'https://sqs.example/a-search-provider-amazon-live-dlq.fifo',
      logError: () => {},
      source: 'amazon',
    });

    assert.equal(out.results[0].deadLettered, true);
    assert.equal(sends.length, 1);
    assert.equal(deletes.length, 1);
    assert.equal(
      puts.filter((p) => String(p.Key || '').includes('/IN/')).length,
      0,
    );
  });
});
