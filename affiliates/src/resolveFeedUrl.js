'use strict';

/**
 * FR #4176: substitute {feedapikey}/{darwinhash}/{feedid} placeholders in
 * affiliate feedurl for the HTTP fetch only. Secrets come from provider meta;
 * affiliate marker feedurl keeps the placeholders.
 */

const { coerceStringMap } = require('../../shared/affiliates/metadata');

const PLACEHOLDER_RE = /\{([a-z0-9_]+)\}/gi;

/**
 * @param {string} feedurl
 * @returns {string[]} unique placeholder names (lowercase)
 */
function listFeedUrlPlaceholders(feedurl) {
  const names = new Set();
  const s = feedurl == null ? '' : String(feedurl);
  let m;
  const re = new RegExp(PLACEHOLDER_RE.source, 'gi');
  while ((m = re.exec(s))) {
    names.add(String(m[1]).toLowerCase());
  }
  return [...names];
}

/**
 * Build the URL used for fetch. Never returns secrets in the input maps.
 * @param {{
 *   feedurl: string,
 *   affiliateMeta?: Record<string,string>,
 *   providerMeta?: Record<string,string>,
 * }} opts
 * @returns {{
 *   ok: true, fetchUrl: string, placeholdersResolved: boolean
 * } | {
 *   ok: false, code: 'unresolved_placeholder', missing: string[], placeholdersResolved: false
 * }}
 */
function resolveFeedUrlForFetch(opts) {
  const feedurl = opts && opts.feedurl != null ? String(opts.feedurl) : '';
  const affiliate = coerceStringMap(opts && opts.affiliateMeta);
  const provider = coerceStringMap(opts && opts.providerMeta);
  const names = listFeedUrlPlaceholders(feedurl);
  if (names.length === 0) {
    return { ok: true, fetchUrl: feedurl, placeholdersResolved: false };
  }

  /** @type {Record<string, string>} */
  const values = Object.create(null);
  // Provider secrets (never written back to affiliate marker by caller).
  if (provider.feedapikey) values.feedapikey = String(provider.feedapikey);
  if (provider.darwinhash) values.darwinhash = String(provider.darwinhash);
  // Affiliate non-secret ids.
  if (affiliate.feedid) values.feedid = String(affiliate.feedid);
  if (affiliate.affiliateid) values.affiliateid = String(affiliate.affiliateid);

  const missing = [];
  for (const name of names) {
    if (values[name] == null || values[name] === '') missing.push(name);
  }
  if (missing.length) {
    return {
      ok: false,
      code: 'unresolved_placeholder',
      missing,
      placeholdersResolved: false,
    };
  }

  const fetchUrl = feedurl.replace(PLACEHOLDER_RE, (_, rawName) => {
    const name = String(rawName).toLowerCase();
    return encodeURIComponent(values[name]);
  });
  // Safety: any leftover brace form means we missed a name.
  if (/\{[a-z0-9_]+\}/i.test(fetchUrl)) {
    return {
      ok: false,
      code: 'unresolved_placeholder',
      missing: listFeedUrlPlaceholders(fetchUrl),
      placeholdersResolved: false,
    };
  }
  return { ok: true, fetchUrl, placeholdersResolved: true };
}

module.exports = {
  listFeedUrlPlaceholders,
  resolveFeedUrlForFetch,
};
