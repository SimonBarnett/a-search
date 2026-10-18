'use strict';

/**
 * FR-243: OAuth 1.0a HMAC-SHA256 signing for Magento / Adobe Commerce REST.
 * Never log secrets.
 */

const crypto = require('node:crypto');

/**
 * RFC 3986 percent-encode.
 * @param {string} s
 */
function pctEncode(s) {
  return encodeURIComponent(String(s))
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%7E/gi, '~');
}

/**
 * @param {Record<string, string|number|boolean|undefined|null>} params
 */
function normalizeParams(params) {
  const pairs = [];
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    pairs.push([pctEncode(k), pctEncode(String(v))]);
  }
  pairs.sort((a, b) => {
    if (a[0] === b[0]) return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
    return a[0] < b[0] ? -1 : 1;
  });
  return pairs.map(([k, v]) => `${k}=${v}`).join('&');
}

/**
 * @param {{
 *   method: string,
 *   url: string,
 *   params?: Record<string, string|number|boolean>,
 *   consumerKey: string,
 *   consumerSecret: string,
 *   token?: string,
 *   tokenSecret?: string,
 *   nonce?: string,
 *   timestamp?: string|number,
 *   signatureMethod?: string,
 * }} opts
 * @returns {{ authorization: string, oauthParams: Record<string, string>, signatureBaseString: string, signature: string }}
 */
function signOAuth1(opts) {
  const method = String(opts.method || 'GET').toUpperCase();
  const url = String(opts.url || '');
  const u = new URL(url);
  const baseUrl = `${u.protocol}//${u.host}${u.pathname}`;
  const signatureMethod = String(opts.signatureMethod || 'HMAC-SHA256');
  const oauthParams = {
    oauth_consumer_key: String(opts.consumerKey),
    oauth_nonce:
      opts.nonce != null
        ? String(opts.nonce)
        : crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: signatureMethod,
    oauth_timestamp: String(
      opts.timestamp != null ? opts.timestamp : Math.floor(Date.now() / 1000),
    ),
    oauth_version: '1.0',
  };
  if (opts.token) oauthParams.oauth_token = String(opts.token);

  /** @type {Record<string, string>} */
  const all = { ...(opts.params || {}), ...oauthParams };
  // Merge query string from URL
  u.searchParams.forEach((v, k) => {
    if (all[k] === undefined) all[k] = v;
  });

  const paramString = normalizeParams(all);
  const signatureBaseString = [
    method,
    pctEncode(baseUrl),
    pctEncode(paramString),
  ].join('&');

  const key = `${pctEncode(opts.consumerSecret)}&${pctEncode(opts.tokenSecret || '')}`;
  let signature;
  if (signatureMethod === 'HMAC-SHA1') {
    signature = crypto
      .createHmac('sha1', key)
      .update(signatureBaseString)
      .digest('base64');
  } else {
    signature = crypto
      .createHmac('sha256', key)
      .update(signatureBaseString)
      .digest('base64');
  }

  const headerParams = { ...oauthParams, oauth_signature: signature };
  const authorization =
    'OAuth ' +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${pctEncode(k)}="${pctEncode(headerParams[k])}"`)
      .join(', ');

  return {
    authorization,
    oauthParams: headerParams,
    signatureBaseString,
    signature,
  };
}

module.exports = {
  pctEncode,
  normalizeParams,
  signOAuth1,
};
