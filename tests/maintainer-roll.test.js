'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { selectDueKeys, roll } = require('../maintainer/src/roll');

const NOW = new Date('2026-10-07T12:00:00.000Z');

function row(partial) {
  return {
    Source: 'awin',
    FeedKey: 'k',
    Env: 'live',
    NextCheck: null,
    LastChecked: null,
    ...partial,
  };
}

describe('FR-012 maintainer roll', () => {
  it('returns <= MAINTAINER_TOP', () => {
    const rows = [];
    for (let i = 0; i < 10; i++) {
      rows.push(
        row({
          FeedKey: `k${i}`,
          NextCheck: new Date(NOW.getTime() - (10 - i) * 60_000),
        }),
      );
    }
    const due = selectDueKeys(rows, { env: 'live', top: 3, now: NOW });
    assert.equal(due.length, 3);
  });

  it('excludes future NextCheck', () => {
    const rows = [
      row({ FeedKey: 'past', NextCheck: new Date('2026-10-07T11:00:00.000Z') }),
      row({ FeedKey: 'future', NextCheck: new Date('2026-10-07T13:00:00.000Z') }),
      row({ FeedKey: 'nullcheck', NextCheck: null }),
    ];
    const due = selectDueKeys(rows, { env: 'live', top: 10, now: NOW });
    const keys = due.map((r) => r.FeedKey).sort();
    assert.deepEqual(keys, ['nullcheck', 'past']);
  });

  it('excludes other env', () => {
    const rows = [
      row({ FeedKey: 'live1', Env: 'live', NextCheck: new Date('2026-10-07T11:00:00.000Z') }),
      row({
        FeedKey: 'sand1',
        Env: 'sandbox',
        NextCheck: new Date('2026-10-07T11:00:00.000Z'),
      }),
    ];
    const due = selectDueKeys(rows, { env: 'live', top: 10, now: NOW });
    assert.equal(due.length, 1);
    assert.equal(due[0].FeedKey, 'live1');
  });

  it('oldest first (NextCheck ascending, nulls first)', () => {
    const rows = [
      row({ FeedKey: 'newer', NextCheck: new Date('2026-10-07T11:30:00.000Z') }),
      row({ FeedKey: 'older', NextCheck: new Date('2026-10-07T10:00:00.000Z') }),
      row({ FeedKey: 'never', NextCheck: null }),
    ];
    const due = selectDueKeys(rows, { env: 'live', top: 10, now: NOW });
    assert.deepEqual(
      due.map((r) => r.FeedKey),
      ['never', 'older', 'newer'],
    );
  });

  it('roll() uses query + env/top from envVars', async () => {
    const rows = [
      row({ FeedKey: 'a', NextCheck: new Date('2026-10-07T11:00:00.000Z') }),
      row({ FeedKey: 'b', Env: 'sandbox', NextCheck: new Date('2026-10-07T11:00:00.000Z') }),
    ];
    const result = await roll({
      queryPartFeedKeys: async () => rows,
      envVars: { A_SEARCH_ENV: 'live', MAINTAINER_TOP: '1' },
      now: NOW,
    });
    assert.equal(result.env, 'live');
    assert.equal(result.top, 1);
    assert.equal(result.keys.length, 1);
    assert.equal(result.keys[0].FeedKey, 'a');
  });
});
