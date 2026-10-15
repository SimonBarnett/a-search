'use strict';

/**
 * FR-228: injectable mail sender (stub in tests; SES/SMTP at deploy).
 * Never log OTP codes from callers; the message body may contain them once.
 */

/**
 * @param {{ send?: (msg: {
 *   to: string,
 *   subject: string,
 *   text?: string,
 *   body?: string,
 *   code?: string,
 *   magicToken?: string,
 *   magicUrl?: string,
 * }) => Promise<{ ok: boolean, id?: string }> }} [opts]
 */
function createMailSender(opts = {}) {
  const sendImpl =
    typeof opts.send === 'function'
      ? opts.send
      : async () => {
          const err = new Error('mail_sender_unconfigured');
          err.code = 'mail_sender_unconfigured';
          throw err;
        };

  return {
    /**
     * @param {object} msg
     */
    async send(msg) {
      if (!msg || typeof msg.to !== 'string' || !msg.to.trim()) {
        const err = new Error('mail_to_required');
        err.code = 'mail_to_required';
        throw err;
      }
      return sendImpl(msg);
    },
  };
}

module.exports = { createMailSender };
