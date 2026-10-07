'use strict';

/** FR-048e: maintainer schedule fatal catch calls reportException */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { handler } = require('../maintainer/src/schedule');

describe('FR-048e maintainer schedule → intake', () => {
  it('schedule.js requires shared reportException', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'maintainer', 'src', 'schedule.js'),
      'utf8',
    );
    assert.match(src, /shared\/intake\/reportException/);
  });

  it('fatal roll invokes reporter once then rethrows', async () => {
    const reports = [];
    const fatal = new Error('mssql down');
    fatal.code = 'sql_boom';

    await assert.rejects(
      () =>
        handler(
          {},
          {},
          {
            envVars: { A_SEARCH_ENV: 'sandbox' },
            roll: async () => {
              throw fatal;
            },
            reportException: async (opts) => {
              reports.push(opts);
              return { ok: true };
            },
          },
        ),
      (err) => err === fatal,
    );

    assert.equal(reports.length, 1);
    assert.equal(reports[0].err, fatal);
    assert.equal(reports[0].route, 'maintainer/schedule');
    assert.equal(reports[0].source, 'maintainer');
  });
});
