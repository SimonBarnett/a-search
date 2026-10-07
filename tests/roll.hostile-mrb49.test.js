'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { selectDueKeys } = require('../maintainer/src/roll');

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

describe('MRB #49 hostile: FR-012 maintainer roll', () => {
  it('<= TOP; excludes future NextCheck; excludes other env; nulls first', () => {
    const rows = [
      row({ FeedKey: 'future', NextCheck: new Date('2026-10-07T13:00:00.000Z') }),
      row({ FeedKey: 'sand', Env: 'sandbox', NextCheck: new Date('2026-10-07T10:00:00.000Z') }),
      row({ FeedKey: 'newer', NextCheck: new Date('2026-10-07T11:30:00.000Z') }),
      row({ FeedKey: 'older', NextCheck: new Date('2026-10-07T10:00:00.000Z') }),
      row({ FeedKey: 'never', NextCheck: null }),
    ];
    const due = selectDueKeys(rows, { env: 'live', top: 2, now: NOW });
    assert.equal(due.length, 2);
    assert.deepEqual(
      due.map((r) => r.FeedKey),
      ['never', 'older']
    );
  });
});
