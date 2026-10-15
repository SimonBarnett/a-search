'use strict';

/**
 * #1344: append-only feedback.json entries for widget Edit dialog.
 */

const REMOVE_REASONS = new Set([
  'not_relevant',
  'too_expensive',
  'broken_or_out_of_stock',
  'wrong_brand_or_merchant',
  'inappropriate',
  'other',
]);

/**
 * @returns {{
 *   append: (widgetGuid: string, entry: object) => object,
 *   list: (widgetGuid: string) => object[],
 * }}
 */
function createFeedbackStore() {
  /** @type {Map<string, object[]>} */
  const byGuid = new Map();
  return {
    append(widgetGuid, entry) {
      const key = String(widgetGuid).toLowerCase();
      const list = byGuid.get(key) || [];
      list.push(entry);
      byGuid.set(key, list);
      return entry;
    },
    list(widgetGuid) {
      const key = String(widgetGuid).toLowerCase();
      return (byGuid.get(key) || []).slice();
    },
  };
}

/**
 * Validate and normalize a feedback body.
 * @param {object} body
 * @param {string} byUserId
 * @param {number} [nowMs]
 */
function buildFeedbackEntry(body, byUserId, nowMs) {
  const type = String((body && body.type) || '')
    .trim()
    .toLowerCase();
  const at = new Date(nowMs != null ? nowMs : Date.now()).toISOString();
  const user = String(byUserId || '').trim().toUpperCase();
  if (!user) {
    const err = new Error('user_required');
    err.code = 'user_required';
    throw err;
  }
  if (type === 'context') {
    const text = String((body && body.text) || '');
    if (!text.trim()) {
      const err = new Error('context_text_required');
      err.code = 'context_text_required';
      throw err;
    }
    if (text.length > 2000) {
      const err = new Error('context_text_too_long');
      err.code = 'context_text_too_long';
      throw err;
    }
    return { type: 'context', text, byUserId: user, at };
  }
  if (type === 'remove') {
    const reason = String((body && body.reason) || '')
      .trim()
      .toLowerCase();
    if (!REMOVE_REASONS.has(reason)) {
      const err = new Error('invalid_reason');
      err.code = 'invalid_reason';
      throw err;
    }
    let otherText =
      body && body.otherText != null ? String(body.otherText) : null;
    if (reason === 'other') {
      if (!otherText || !String(otherText).trim()) {
        const err = new Error('other_text_required');
        err.code = 'other_text_required';
        throw err;
      }
      if (String(otherText).length > 500) {
        const err = new Error('other_text_too_long');
        err.code = 'other_text_too_long';
        throw err;
      }
      otherText = String(otherText);
    } else {
      otherText = null;
    }
    return {
      type: 'remove',
      partNumber: body.partNumber != null ? String(body.partNumber) : null,
      partId: body.partId != null ? String(body.partId) : null,
      reason,
      otherText,
      byUserId: user,
      at,
    };
  }
  const err = new Error('invalid_feedback_type');
  err.code = 'invalid_feedback_type';
  throw err;
}

module.exports = {
  REMOVE_REASONS,
  createFeedbackStore,
  buildFeedbackEntry,
};
