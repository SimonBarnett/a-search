'use strict';

/**
 * Hostile MRB #4923 fix: final-receive DONE=dlq for hard 5xx AND transient
 * 429/502-504 (SQS redrive runs no code), plus walrus writeAClubsDoneFs flip.
 * Refs SimonBarnett/a-search#4917 / PR #4923.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { handleSqsWith429 } = require('../shared/search/handleSqsWith429');
const { writeAClubsDoneFs } = require('../walrus/src/writeAClubsDoneFs');

const HOST = 'www.mrb4923-hostile.test';
const GUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SEARCHID = 'srch_mrb4923_final';

function s3Deps(puts) {
  return {
    putObject: async (args) => {
      puts.push(args);
      return {};
    },
    getObject: async () => {
      const e = new Error('NoSuchKey');
      e.name = 'NoSuchKey';
      e.$metadata = { httpStatusCode: 404 };
      throw e;
    },
    headObject: async () => {
      const e = new Error('NotFound');
      e.name = 'NotFound';
      e.$metadata = { httpStatusCode: 404 };
      throw e;
    },
  };
}

describe('MRB #4923 hostile: final-receive DONE + walrus FS hasresults', () => {
  it('hard 5xx on final receive writes DONE status=dlq then throws', async () => {
    const puts = [];
    const sent = [];
    const deleted = [];
    const err = Object.assign(new Error('upstream 500'), { statusCode: 500 });
    const msg = {
      searchid: SEARCHID,
      hostkey: HOST,
      guid: GUID,
      env: 'sandbox',
      source: 'ebay',
    };
    await assert.rejects(
      () =>
        handleSqsWith429({
          event: {
            Records: [
              {
                body: JSON.stringify(msg),
                receiptHandle: 'rh-final-500',
                attributes: {
                  MessageGroupId: 'ebay',
                  ApproximateReceiveCount: '3',
                },
              },
            ],
          },
          run: async () => {
            throw err;
          },
          deps: s3Deps(puts),
          sendMessage: async (input) => {
            sent.push(input);
          },
          deleteMessage: async (input) => {
            deleted.push(input);
          },
          queueUrl: 'https://sqs.example/ebay.fifo',
          dlqUrl: 'https://sqs.example/ebay-dlq.fifo',
          maxReceiveCount: 3,
          logError: () => {},
          source: 'ebay',
          envVars: { A_CLUBS_BUCKET: 'test-a-clubs' },
        }),
      /500|upstream/,
    );
    assert.equal(sent.length, 0);
    assert.equal(deleted.length, 0);
    const donePuts = puts.filter((p) =>
      String(p.Key || '') === `_search-done/${SEARCHID}/ebay.json`,
    );
    assert.equal(donePuts.length, 1);
    const body = JSON.parse(String(donePuts[0].Body || ''));
    assert.equal(body.status, 'dlq');
    assert.equal(body.source, 'ebay');
  });

  it('transient 502 on final receive writes DONE status=dlq then throws', async () => {
    const puts = [];
    const sent = [];
    const deleted = [];
    const err = Object.assign(new Error('upstream 502'), { statusCode: 502 });
    const msg = {
      searchid: SEARCHID,
      hostkey: HOST,
      guid: GUID,
      env: 'sandbox',
      source: 'amazon',
    };
    await assert.rejects(
      () =>
        handleSqsWith429({
          event: {
            Records: [
              {
                body: JSON.stringify(msg),
                receiptHandle: 'rh-final-502',
                attributes: {
                  MessageGroupId: 'amazon',
                  ApproximateReceiveCount: '3',
                },
              },
            ],
          },
          run: async () => {
            throw err;
          },
          deps: s3Deps(puts),
          changeMessageVisibility: async () => {},
          sendMessage: async (input) => {
            sent.push(input);
          },
          deleteMessage: async (input) => {
            deleted.push(input);
          },
          queueUrl: 'https://sqs.example/amazon.fifo',
          dlqUrl: 'https://sqs.example/amazon-dlq.fifo',
          maxReceiveCount: 3,
          logError: () => {},
          source: 'amazon',
          envVars: { A_CLUBS_BUCKET: 'test-a-clubs' },
        }),
      /502|upstream/,
    );
    // Transient path: no immediate DLQ send; DONE still required before redrive.
    assert.equal(sent.length, 0);
    assert.equal(deleted.length, 0);
    const donePuts = puts.filter((p) =>
      String(p.Key || '') === `_search-done/${SEARCHID}/amazon.json`,
    );
    assert.equal(donePuts.length, 1);
    const body = JSON.parse(String(donePuts[0].Body || ''));
    assert.equal(body.status, 'dlq');
    assert.equal(body.source, 'amazon');
    assert.equal(
      puts.filter((p) => /\/IN\//i.test(String(p.Key || ''))).length,
      0,
    );
  });

  it('writeAClubsDoneFs flips hasresults=1 when fan-out DONE set is complete', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mrb4923-aclubs-'));
    try {
      const guidDir = path.join(root, HOST, GUID);
      fs.mkdirSync(guidDir, { recursive: true });
      fs.writeFileSync(
        path.join(guidDir, 'search-fanout.json'),
        `${JSON.stringify({ searchid: SEARCHID, queued: ['sql', 'cj'], at: 't' })}\n`,
        'utf8',
      );
      fs.writeFileSync(
        path.join(guidDir, '.a-search-meta.json'),
        `${JSON.stringify({ hasresults: '0', enabled: '0', annotated: '1' }, null, 2)}\n`,
        'utf8',
      );

      const first = await writeAClubsDoneFs({
        root,
        msg: { host: HOST, guid: GUID, searchid: SEARCHID },
        source: 'sql',
        status: 'serviced',
        products: 0,
        now: '2026-10-25T12:10:00.000Z',
      });
      assert.equal(first.hasresults, false);
      assert.ok(fs.existsSync(first.abs));

      const second = await writeAClubsDoneFs({
        root,
        msg: { host: HOST, guid: GUID, searchid: SEARCHID },
        source: 'cj',
        status: 'serviced',
        products: 3,
        now: '2026-10-25T12:11:00.000Z',
      });
      assert.equal(second.hasresults, true);
      const meta = JSON.parse(
        fs.readFileSync(path.join(guidDir, '.a-search-meta.json'), 'utf8'),
      );
      assert.equal(String(meta.hasresults), '1');
      assert.equal(String(meta.enabled), '0');
      assert.equal(String(meta.annotated), '1');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
