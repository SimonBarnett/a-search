'use strict';

/**
 * FR #4918 SEA entry for a-hasresults-monitor.exe (redqueen).
 * --version exits 0 before AWS.
 */

const { version } = require('../../package.json');

if (process.argv.indexOf('--version') !== -1) {
  process.stdout.write(`a-hasresults-monitor ${version}\n`);
  process.exit(0);
}

const { main } = require('../../redqueen/src/hasresultsMonitorMain');

main().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
