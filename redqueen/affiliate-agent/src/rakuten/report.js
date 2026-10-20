'use strict';

const fs = require('node:fs');
const path = require('node:path');

function uniq(arr) {
  return [...new Set((arr || []).map(String).filter(Boolean))];
}

/**
 * @param {object} input
 */
function buildRakutenReport(input) {
  const applied = uniq(input.applied);
  const skipped = uniq(input.skipped);
  const pending = uniq(input.pending);
  const approved = uniq(input.approved);
  const declined = uniq(input.declined);
  const partnershipsLive = uniq(input.partnershipsLive);
  const notifySimon = uniq(input.notifySimon);
  const skillsAdded = uniq(input.skillsAdded);
  return {
    day: String(input.day || ''),
    provider: 'rakuten',
    dryRun: Boolean(input.dryRun),
    alreadyRunning: Boolean(input.alreadyRunning),
    counts: {
      applied: applied.length,
      skipped: skipped.length,
      pending: pending.length,
      approved: approved.length,
      declined: declined.length,
      partnershipsLive: partnershipsLive.length,
      notifySimon: notifySimon.length,
      skillsAdded: skillsAdded.length,
    },
    applied,
    skipped,
    pending,
    approved,
    declined,
    partnershipsLive,
    notifySimon,
    skillsAdded,
  };
}

function writeDailyReportFile(report, reportDir, io = {}) {
  const mkdir = io.mkdirSync || fs.mkdirSync;
  const write = io.writeFileSync || fs.writeFileSync;
  mkdir(reportDir, { recursive: true });
  const file = path.join(reportDir, `${report.day}.json`);
  write(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return file;
}

module.exports = {
  buildRakutenReport,
  writeDailyReportFile,
};
