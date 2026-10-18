'use strict';

/**
 * FR #4001: CLI entry for the Windows Scheduled Task on redqueen.
 * Wire real AWS SDK / mssql at deploy time via env; unit tests call runDailyImport directly.
 */

async function main(argv) {
  const args = argv || process.argv.slice(2);
  if (args.includes('--help')) {
    process.stdout.write(
      'a-search affiliate-import: daily a-affiliates -> asearch DB + live.json prune\n' +
        '  --dry-run   list pending only\n' +
        'See docs/redqueen-affiliate-import.md\n',
    );
    return 0;
  }
  // Deploy wiring is install-time; this stub exits 0 when no injectors are configured
  // so the scheduled task can be registered before IAM/DB secrets are present.
  if (!process.env.A_SEARCH_AFFILIATE_IMPORT_WIRED) {
    process.stdout.write(
      'affiliate-import: not wired (set A_SEARCH_AFFILIATE_IMPORT_WIRED=1 with S3/DB injectors)\n',
    );
    return 0;
  }
  const { runDailyImport } = require('./runImport');
  // Real injectors would be required here by the redqueen install pack.
  throw new Error(
    'affiliate-import: wired mode requires a site-local runner (see docs)',
  );
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(String(err && err.message ? err.message : err));
      process.exit(1);
    });
}

module.exports = { main };
