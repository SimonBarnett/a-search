'use strict';

/**
 * FR-228: injectable SMS sender for merchant OTP (stub in tests).
 * Deploy: AWS SNS Publish / End User Messaging SMS; Twilio optional adapter.
 * Never log raw codes; mask phone in application logs (maskPhone).
 */

/**
 * @param {{ send?: (msg: {
 *   to: string,
 *   body?: string,
 *   text?: string,
 *   code?: string,
 * }) => Promise<{ ok: boolean, id?: string }> }} [opts]
 */
function createSmsSender(opts = {}) {
  const sendImpl =
    typeof opts.send === 'function'
      ? opts.send
      : async () => {
          const err = new Error('sms_sender_unconfigured');
          err.code = 'sms_sender_unconfigured';
          throw err;
        };

  return {
    /**
     * @param {object} msg
     */
    async send(msg) {
      if (!msg || typeof msg.to !== 'string' || !msg.to.trim()) {
        const err = new Error('sms_to_required');
        err.code = 'sms_to_required';
        throw err;
      }
      return sendImpl(msg);
    },
  };
}

module.exports = { createSmsSender };
