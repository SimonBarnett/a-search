'use strict';

/**
 * Hostile pin: MRB a-search#3632 — POST /w/events and GET /widgets/stats
 * must win over FR-208 ComponentsPiece 501 stubs.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('mrb3632 hostile: widget events wire over cp stub', () => {
  it('index.js requires widgetEvents/widgetsStats and handles them before cpRoute', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'entry', 'src', 'index.js'),
      'utf8',
    );
    assert.match(text, /handleWidgetEvents/);
    assert.match(text, /handleWidgetsStats/);
    const evIdx = text.indexOf('if (widgetEventsRoute)');
    const statsIdx = text.indexOf('if (widgetsStatsRoute)');
    const cpIdx = text.indexOf('if (cpRoute)');
    assert.ok(evIdx > 0 && statsIdx > evIdx, 'stats after events');
    assert.ok(cpIdx > statsIdx, 'cp stub after widget events/stats');
  });

  it('rollupStatsJson never calls agentQueue.enqueue', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'shared', 'events', 'rollupStatsJson.js'),
      'utf8',
    );
    assert.match(text, /Must never raise an agent job/);
    assert.doesNotMatch(text, /\.enqueue\s*\(/);
  });
});
