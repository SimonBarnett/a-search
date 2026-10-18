'use strict';

/**
 * FR #4123: daily run report (counts + advertiser ids only; never secrets).
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {{
 *   day: string,
 *   dryRun?: boolean,
 *   invited?: string[],
 *   joined?: string[],
 *   approved?: string[],
 *   foldersCreated?: string[],
 *   foldersUpdated?: string[],
 *   noFeedFollowUps?: string[],
 *   notifySimon?: string[],
 *   alreadyRunning?: boolean,
 * }} input
 */
function buildDailyReport(input) {
  const invited = uniq(input.invited);
  const joined = uniq(input.joined);
  const approved = uniq(input.approved);
  const foldersCreated = uniq(input.foldersCreated);
  const foldersUpdated = uniq(input.foldersUpdated);
  const noFeedFollowUps = uniq(input.noFeedFollowUps);
  const notifySimon = uniq(input.notifySimon);
  return {
    day: String(input.day || ''),
    dryRun: Boolean(input.dryRun),
    alreadyRunning: Boolean(input.alreadyRunning),
    counts: {
      invited: invited.length,
      joined: joined.length,
      approved: approved.length,
      foldersCreated: foldersCreated.length,
      foldersUpdated: foldersUpdated.length,
      noFeedFollowUps: noFeedFollowUps.length,
      notifySimon: notifySimon.length,
    },
    invited,
    joined,
    approved,
    foldersCreated,
    foldersUpdated,
    noFeedFollowUps,
    notifySimon,
  };
}

/**
 * @param {object} report
 * @param {string} reportDir
 * @param {{ writeFileSync?: Function, mkdirSync?: Function }} [io]
 * @returns {string} path written
 */
function writeDailyReportFile(report, reportDir, io = {}) {
  const mkdir = io.mkdirSync || fs.mkdirSync.bind(fs);
  const write = io.writeFileSync || fs.writeFileSync;
  mkdir(reportDir, { recursive: true });
  const day = String(report.day || 'unknown');
  const file = path.join(reportDir, `${day}.json`);
  write(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return file;
}

function uniq(list) {
  return [...new Set((list || []).map((x) => String(x)))];
}

module.exports = { buildDailyReport, writeDailyReportFile };
