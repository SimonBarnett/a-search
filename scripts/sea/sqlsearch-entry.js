'use strict';

/**
 * FR #4827 SEA entry for a-sqlsearch.exe.
 * --version exits 0 before the SQL drain env gate.
 */

const { version } = require('../../package.json');

if (process.argv.indexOf('--version') !== -1) {
  process.stdout.write(`a-sqlsearch ${version}\n`);
  process.exit(0);
}

const { main } = require('../../walrus/src/index');

main().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
