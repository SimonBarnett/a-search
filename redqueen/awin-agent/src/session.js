'use strict';

/**
 * FR #4123: browser/session adapter surface for Awin UI.
 * Real Playwright wiring is injected on redqueen; tests mock this.
 */

const OTP_URL_NEEDLE = 'id.awin.com/u/mfa-otp-challenge';

/**
 * @param {string} url
 * @returns {boolean}
 */
function isOtpChallengeUrl(url) {
  return String(url || '')
    .toLowerCase()
    .includes(OTP_URL_NEEDLE);
}

/**
 * Sign-in result for the daily agent.
 * @param {{
 *   browser: {
 *     goto: Function,
 *     currentUrl: Function,
 *     typeEmail?: Function,
 *     typePasswordFromFile?: Function,
 *     submit?: Function,
 *   },
 *   email: string,
 *   passwordTempPath: string,
 *   loginUrl?: string,
 * }} opts
 * @returns {Promise<{ ok: true } | { ok: false, code: 'otp_required'|'signin_blocked', detail?: string }>}
 */
async function signInPublisher(opts) {
  const browser = opts.browser;
  const loginUrl =
    opts.loginUrl ||
    process.env.AWIN_LOGIN_URL ||
    'https://ui.awin.com/idp/login';
  await browser.goto(loginUrl);
  let url = await browser.currentUrl();
  if (isOtpChallengeUrl(url)) {
    return { ok: false, code: 'otp_required', detail: url };
  }
  if (typeof browser.typeEmail === 'function') {
    await browser.typeEmail(opts.email);
  }
  if (typeof browser.typePasswordFromFile === 'function') {
    await browser.typePasswordFromFile(opts.passwordTempPath);
  }
  if (typeof browser.submit === 'function') {
    await browser.submit();
  }
  url = await browser.currentUrl();
  if (isOtpChallengeUrl(url)) {
    return { ok: false, code: 'otp_required', detail: url };
  }
  if (/captcha|challenge|blocked/i.test(String(url))) {
    return { ok: false, code: 'signin_blocked', detail: url };
  }
  return { ok: true };
}

module.exports = {
  OTP_URL_NEEDLE,
  isOtpChallengeUrl,
  signInPublisher,
};
