'use strict';

/**
 * MRB #4831: runDrainJob must not write a-clubs IN/ when the worker returns 0 products (FR #4823 / #4827 acceptance 4).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runDrainJob } = require('../walrus/src/runJob');
const { inResultKey } = require('../shared/search/inResultSchema');

const HOST = 'www.mymodelflyingclub.co.uk';
const GUID = 'de986521-72d8-4d55-8da3-12ca524d8d74';

describe('MRB #4831 runDrainJob empty IN', () => {
  it('worker ok + products [] + no key writes no IN file', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a-clubs-mrb4831-'));
    const searchid = 'srch_mrb4831_empty';
    await runDrainJob(
      {
        source: 'sql',
        searchid,
        host: HOST,
        hostkey: HOST,
        guid: GUID,
        widgetGuid: GUID,
        env: 'live',
      },
      {
        aClubsRoot: root,
        repoRoot: path.join(__dirname, '..'),
        envVars: {
          MSSQL_DATABASE: 'a_search',
          A_SEARCH_ENV: 'live',
          A_CLUBS_ROOT: root,
        },
        loadWorker: () => ({
          run: async () => ({ ok: true, products: [], key: null }),
        }),
        touchLastmod: async () => {},
      },
    );
    const key = inResultKey({
      hostkey: HOST,
      guid: GUID,
      searchid,
      source: 'sql',
    });
    const abs = path.join(root, key.replace(/\//g, path.sep));
    assert.equal(fs.existsSync(abs), false);
  });
});
