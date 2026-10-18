'use strict';

/**
 * FR #4287: idempotent a-clubs host-marker userid migration.
 * Dry-run unless --apply. Prints counts only.
 *
 *   node scripts/migrate-aclubs-host-userid.js
 *   node scripts/migrate-aclubs-host-userid.js --apply
 */

const { buildS3Fns } = require('../parts-gateway/src/handler');
const {
  migrateHostMarkers,
  formatMigrationCounts,
} = require('../parts-gateway/src/migrateHostUserid');

async function main() {
  const apply = process.argv.includes('--apply');
  const s3 = buildS3Fns({});
  const result = await migrateHostMarkers({
    ...s3,
    bucket: process.env.A_CLUBS_BUCKET || 'a-clubs',
    apply,
  });
  process.stdout.write(`${formatMigrationCounts(result)}\n`);
}

main().catch((err) => {
  process.stderr.write(`migrate_failed:${err && err.name ? err.name : 'error'}\n`);
  process.exitCode = 1;
});
