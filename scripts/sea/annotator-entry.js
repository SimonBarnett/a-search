'use strict';

/**
 * FR #4827 SEA entry for a-annotator.exe.
 * --version exits 0 before the drain (and before AWS clients) load.
 */

const { version } = require('../../package.json');

if (process.argv.indexOf('--version') !== -1) {
  process.stdout.write(`a-annotator ${version}\n`);
  process.exit(0);
}

const { main } = require('../../redqueen/src/run');

main().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
