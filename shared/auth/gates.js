'use strict';

/**
 * FR-228: merchant / partner gates require a contact-verified session.
 */

class ContactUnverifiedError extends Error {
  constructor(message) {
    super(message || 'contact_unverified');
    this.name = 'ContactUnverifiedError';
    this.code = 'contact_unverified';
  }
}

/**
 * @param {{ userId?: string, contactVerified?: boolean }|null|undefined} auth
 */
function assertContactVerified(auth) {
  if (!auth || auth.contactVerified !== true) {
    throw new ContactUnverifiedError('contact_unverified');
  }
  return auth;
}

module.exports = { assertContactVerified, ContactUnverifiedError };
