'use strict';

/**
 * FR #4701: Rakuten publisher dashboard sign-in (Merc-style code).
 * Captcha / code failure => stop and notify Simon (no retry loop).
 */

/**
 * @param {{
 *   browser?: {
 *     signIn?: Function,
 *     getPageUrl?: Function,
 *   },
 *   email: string,
 *   passwordTempPath?: string,
 *   publisherId?: string,
 * }} opts
 */
async function signInPublisher(opts) {
  if (!opts.browser || typeof opts.browser.signIn !== 'function') {
    return { ok: true, code: 'skipped' };
  }
  const result = await opts.browser.signIn({
    email: opts.email,
    passwordTempPath: opts.passwordTempPath,
    publisherId: opts.publisherId || '4766177',
  });
  if (result && result.ok === false) {
    return {
      ok: false,
      code: String(result.code || 'signin_failed'),
      detail: String(result.detail || '').slice(0, 200),
    };
  }
  if (result && result.captcha) {
    return { ok: false, code: 'captcha', detail: 'captcha_blocked' };
  }
  const url =
    typeof opts.browser.getPageUrl === 'function'
      ? String(opts.browser.getPageUrl() || '')
      : '';
  if (/captcha|challenge|verify/i.test(url)) {
    return { ok: false, code: 'captcha', detail: url.slice(0, 120) };
  }
  return { ok: true, code: 'ok' };
}

module.exports = { signInPublisher };
