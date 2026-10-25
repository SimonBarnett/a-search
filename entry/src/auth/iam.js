'use strict';

/**
 * FR #4888: HTTP API IAM authorizer identity on the Lambda event.
 */

function iamAuthorizerIdentity(event) {
  const ctx = event && event.requestContext;
  const authorizer = ctx && ctx.authorizer;
  if (!authorizer || typeof authorizer !== 'object') return null;
  const iam = authorizer.iam || authorizer.IAM;
  if (!iam || typeof iam !== 'object') return null;
  const userArn = String(iam.userArn || iam.userID || iam.userId || '').trim();
  if (!userArn) return null;
  return { userId: userArn, iam: true };
}

module.exports = {
  iamAuthorizerIdentity,
};
