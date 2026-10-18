'use strict';

/**
 * FR #4195: alias --- weekly entry points call the daily 7-day refresh job.
 */

module.exports = require('./runDaily');
