'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { handler } = require('../maintainer/src/schedule');

describe('MRB #107 hostile: FR-031 schedule wire', () => {
  it('handler is not a stub; message has no stub; skill documents wire', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'maintainer', 'src', 'schedule.js'),
      'utf8',
    );
    assert.match(src, /upsertParts|defaultUpsertParts/);
    assert.match(src, /deleteMissingParts|defaultDeleteMissing/);
    assert.doesNotMatch(src, /later FRs still pending|worker stub/i);
    const skill = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'maintainer',
        '.grok',
        'skills',
        'a-search-maintainer',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /Schedule handler \(wired\)|schedule\.js/);

    const res = await handler(
      {},
      {},
      {
        envVars: { A_SEARCH_ENV: 'sandbox' },
        queryPartFeedKeys: async () => [
          {
            Source: 'awin',
            FeedKey: 'k1',
            Env: 'sandbox',
            FeedUrl: 'https://example.invalid/f.json',
            NextCheck: new Date(0),
          },
        ],
        httpGet: async () => ({
          status: 200,
          headers: {},
          body: Buffer.from('[{"MerchantProductId":"1","Title":"t"}]'),
        }),
        runMerge: async () => ({ ok: true }),
        runScopedDelete: async () => ({ deleted: 0 }),
      },
    );
    assert.equal(res.ok, true);
    assert.ok(res.processed > 0);
    assert.doesNotMatch(res.message, /stub/i);
  });
});