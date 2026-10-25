'use strict';

/**
 * FR #4916 SEA entry for a-searches.exe.
 * --version exits 0 before AWS clients load.
 */

const { version } = require('../../package.json');

if (process.argv.indexOf('--version') !== -1) {
  process.stdout.write(`a-searches ${version}\n`);
  process.exit(0);
}

const { main } = require('../../searches/src/cli');

main(process.argv.slice(2)).then(
  (code) => process.exit(code == null ? 0 : code),
  (err) => {
    const message = err && err.message ? err.message : String(err);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  },
);
