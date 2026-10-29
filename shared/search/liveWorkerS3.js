'use strict';

/**
 * FR #4428: Lambda invokes handler(event, context). Context is not deps.
 * When putObject was not injected, build S3 calls with the AWS SDK default
 * credential chain. writeLiveProviderInResult injects A_CLUBS_BUCKET on every
 * S3 call (put/head/get/copy/tagging) — FR #4441.
 */

const S3_COMMANDS = {
  putObject: 'PutObjectCommand',
  headObject: 'HeadObjectCommand',
  getObject: 'GetObjectCommand',
  copyObject: 'CopyObjectCommand',
  getObjectTagging: 'GetObjectTaggingCommand',
  putObjectTagging: 'PutObjectTaggingCommand',
  listObjectAnnotations: 'ListObjectAnnotationsCommand',
};

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isLambdaContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (typeof value.putObject === 'function') return false;
  return (
    typeof value.getRemainingTimeInMillis === 'function' ||
    typeof value.awsRequestId === 'string' ||
    (typeof value.functionName === 'string' &&
      typeof value.invokedFunctionArn === 'string')
  );
}

/**
 * @param {(() => { send: Function })|undefined} createS3Client
 * @returns {Record<string, Function>}
 */
function buildDefaultS3Fns(createS3Client) {
  let client;
  function getClient() {
    if (!client) {
      if (typeof createS3Client === 'function') {
        client = createS3Client();
      } else {
        const { S3Client } = require('@aws-sdk/client-s3');
        client = new S3Client({});
      }
    }
    return client;
  }

  /** @type {Record<string, Function>} */
  const fns = {};
  for (const [method, commandName] of Object.entries(S3_COMMANDS)) {
    fns[method] = async (input) => {
      const sdk = require('@aws-sdk/client-s3');
      const Command = sdk[commandName];
      const c = getClient();
      if (Command) return c.send(new Command(input));
      return c.send(input);
    };
  }
  return fns;
}

/**
 * Ignore a Lambda context. Keep an injected putObject. Otherwise fill S3 fns.
 * @param {unknown} arg
 * @returns {object}
 */
function attachDefaultS3(arg) {
  if (isLambdaContext(arg) || arg == null || typeof arg !== 'object' || Array.isArray(arg)) {
    return buildDefaultS3Fns(undefined);
  }
  if (typeof arg.putObject === 'function') {
    // FR #5275: keep injected putObject but fill missing listObjectAnnotations
    // (and other S3_COMMANDS) so CopyObject AccessDenied can still Put when
    // the marker has no annotations.
    const built = buildDefaultS3Fns(arg.createS3Client);
    for (const name of Object.keys(built)) {
      if (typeof arg[name] !== 'function') arg[name] = built[name];
    }
    return arg;
  }
  return Object.assign({}, arg, buildDefaultS3Fns(arg.createS3Client));
}

module.exports = {
  isLambdaContext,
  attachDefaultS3,
  buildDefaultS3Fns,
};
