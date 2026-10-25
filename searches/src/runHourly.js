'use strict';

/**
 * FR #4916: hourly a-searches loop — select due GUIDs and invoke searchable runner.
 * One failing club does not stop the others. No secrets in logs.
 */

const { selectDueGuidSearches, NeedsDefaultAgeError } = require('./selectDue');

/**
 * @param {{
 *   s3: object,
 *   bucket?: string,
 *   runSearch: (job: {hostkey:string,guid:string,defaultage:number}) => Promise<{searchid?:string,providers_queued?:string[]|number,ok?:boolean,error?:string}>,
 *   log?: Function,
 *   now?: Date,
 *   hasCredentials?: () => boolean,
 * }} deps
 * @returns {Promise<{ ran: number, skipped: number, failed: number, warnings: string[] }>}
 */
async function runHourlySearches(deps) {
  const log = deps.log || (() => {});
  const bucket = deps.bucket || process.env.A_CLUBS_BUCKET || 'a-clubs';
  const hasCreds =
    typeof deps.hasCredentials === 'function'
      ? deps.hasCredentials()
      : Boolean(
          process.env.A_SEARCH_API_URL ||
            process.env.A_SEARCH_SEARCH_API_URL ||
            process.env.AWS_PROFILE ||
            process.env.AWS_ACCESS_KEY_ID,
        );

  if (!hasCreds) {
    log('warn no_credentials: skip hourly run (service stays up)');
    return { ran: 0, skipped: 0, failed: 0, warnings: ['no_credentials'] };
  }

  let selected;
  try {
    selected = await selectDueGuidSearches(deps.s3, bucket, {
      now: deps.now,
      log,
    });
  } catch (err) {
    if (err && err.code === 'needs_defaultage') {
      log(`error ${err.message || 'needs_defaultage'}`);
      return {
        ran: 0,
        skipped: 0,
        failed: 1,
        warnings: ['needs_defaultage'],
      };
    }
    throw err;
  }

  let ran = 0;
  let failed = 0;
  for (const job of selected.due) {
    try {
      const result = await deps.runSearch(job);
      const sid = result && result.searchid != null ? String(result.searchid) : '';
      const pq =
        result && result.providers_queued != null
          ? Array.isArray(result.providers_queued)
            ? result.providers_queued.length
            : result.providers_queued
          : '';
      log(
        `ok host=${job.hostkey} guid=${job.guid} searchid=${sid} providers_queued=${pq} defaultage=${job.defaultage}`,
      );
      ran += 1;
    } catch (err) {
      failed += 1;
      const msg = err && err.message ? String(err.message) : String(err);
      log(`fail host=${job.hostkey} guid=${job.guid} err=${msg.replace(/[^\x20-\x7E]/g, '?')}`);
    }
  }

  return {
    ran,
    skipped: selected.skipped,
    failed,
    warnings: selected.warnings || [],
  };
}

module.exports = {
  runHourlySearches,
  NeedsDefaultAgeError,
};
