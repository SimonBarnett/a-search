'use strict';

/**
 * MRB #5143 hostile pin for FR #5142 hasresults completion race.
 * Refs SimonBarnett/a-search#5143 / #5142.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB #5143 hostile: hasresults recheck + seed gate', () => {
  it('searchDone recordSearchTerminal rechecks missing:* and ERROR-logs flip fail', () => {
    const src = fs.readFileSync(
      path.join(root, 'shared', 'search', 'searchDone.js'),
      'utf8',
    );
    assert.match(src, /recheckDelayMs/);
    assert.match(src, /missing:/);
    assert.match(src, /hasresults_flip_failed/);
    assert.match(src, /recordSearchTerminal/);
  });

  it('recheckHasResults exports recheckIncompleteHasResults', () => {
    const mod = require('../shared/search/recheckHasResults');
    assert.equal(typeof mod.recheckIncompleteHasResults, 'function');
    assert.equal(typeof mod.recheckGuidHasResults, 'function');
  });

  it('hourly + monitor wire recheckIncompleteHasResults', () => {
    const hourly = fs.readFileSync(
      path.join(root, 'searches', 'src', 'runHourly.js'),
      'utf8',
    );
    const mon = fs.readFileSync(
      path.join(root, 'redqueen', 'src', 'hasresultsMonitor.js'),
      'utf8',
    );
    assert.match(hourly, /recheckIncompleteHasResults/);
    assert.match(mon, /recheckIncompleteHasResults/);
  });

  it('walrus writeAClubsDoneFs is async and calls recordSearchTerminal when s3 present', () => {
    const src = fs.readFileSync(
      path.join(root, 'walrus', 'src', 'writeAClubsDoneFs.js'),
      'utf8',
    );
    assert.match(src, /async function writeAClubsDoneFs/);
    assert.match(src, /recordSearchTerminal/);
  });

  it('seed tool refuses writes without --simon-go', () => {
    const src = fs.readFileSync(
      path.join(root, 'tools', 'seed-guid-marker-hasresults.js'),
      'utf8',
    );
    assert.match(src, /--simon-go/);
    assert.match(src, /Refusing to write/);
    assert.doesNotMatch(src, /password=/);
  });
});
