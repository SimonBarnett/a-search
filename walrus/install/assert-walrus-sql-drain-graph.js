'use strict';

/**
 * FR #5023 / fix(mrb-5035) / FR #5270: load-check the walrus SQL drain require
 * graph before service restart. Drain writes IN/ + _search-done/ + hasresults;
 * agent/monitor alone builds live.json. Exit 0 on success; exit 1 with a
 * clear message on MODULE_NOT_FOUND / throw.
 *
 * Usage (from repo / InstallRoot):
 *   node walrus/install/assert-walrus-sql-drain-graph.js
 */

const path = require('node:path');

const installRoot = path.resolve(__dirname, '..', '..');

const targets = [
  {
    label: 'walrus/src/index.js',
    rel: path.join('walrus', 'src', 'index.js'),
  },
  {
    label: 'walrus/src/drainRunner.js',
    rel: path.join('walrus', 'src', 'drainRunner.js'),
  },
  {
    label: 'shared/search/searchDone.js',
    rel: path.join('shared', 'search', 'searchDone.js'),
  },
  {
    label: 'shared/widgets/pageSelect.js',
    rel: path.join('shared', 'widgets', 'pageSelect.js'),
  },
];

function fail(msg) {
  process.stderr.write(`assert-walrus-sql-drain-graph: ${msg}\n`);
  process.exit(1);
}

for (const t of targets) {
  const abs = path.join(installRoot, t.rel);
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    require(abs);
  } catch (err) {
    const code = err && err.code ? String(err.code) : '';
    if (code === 'MODULE_NOT_FOUND') {
      fail(
        `MODULE_NOT_FOUND requiring ${t.label} (${abs}): ${err.message}`,
      );
    }
    fail(
      `throw requiring ${t.label} (${abs}): ${err && err.stack ? err.stack : err}`,
    );
  }
}

process.stdout.write(
  'assert-walrus-sql-drain-graph: ok (index, drainRunner, searchDone, pageSelect)\n',
);
process.exit(0);
