'use strict';

/**
 * Persist onboarding signup events to S3 JSON (FR-052b).
 *
 * LOCKED store: S3 object
 *   {env}/_reports/{source}/{yyyy-MM-dd}/signups.json
 * Body shape: { env, source, day, signups: Signup[] }
 *
 * MSSQL table store is not used. HTML email is out of scope.
 */

const { createHash } = require('node:crypto');
const { signupsKey, dayStamp, SignupsPathError } = require('./signupsPath');

/**
 * @param {{ createS3Client?: () => { send: Function } }} [deps]
 */
function defaultPutObject(deps) {
  return async (args) => {
    if (deps && typeof deps.createS3Client === 'function') {
      return deps.createS3Client().send(args);
    }
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const client = new S3Client({});
    return client.send(new PutObjectCommand(args));
  };
}

/**
 * @param {{ createS3Client?: () => { send: Function } }} [deps]
 */
function defaultGetObject(deps) {
  return async (args) => {
    if (deps && typeof deps.createS3Client === 'function') {
      return deps.createS3Client().send(args);
    }
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    const client = new S3Client({});
    return client.send(new GetObjectCommand(args));
  };
}

/**
 * In-memory S3 stand-in for unit tests.
 * @returns {{
 *   objects: Map<string, string>,
 *   putObject: Function,
 *   getObject: Function,
 * }}
 */
function createMemorySignupsStore() {
  /** @type {Map<string, string>} */
  const objects = new Map();

  async function putObject({ Bucket, Key, Body }) {
    objects.set(`${Bucket}/${Key}`, String(Body));
    return { ETag: '"mem"' };
  }

  async function getObject({ Bucket, Key }) {
    const body = objects.get(`${Bucket}/${Key}`);
    if (body == null) {
      const err = new Error('NoSuchKey');
      err.name = 'NoSuchKey';
      err.Code = 'NoSuchKey';
      throw err;
    }
    return {
      Body: {
        transformToString: async () => body,
      },
    };
  }

  return { objects, putObject, getObject };
}

/**
 * @param {object} row
 * @param {{ source?: string, env?: string }} [defaults]
 * @returns {object}
 */
function normalizeSignup(row, defaults = {}) {
  if (!row || typeof row !== 'object') {
    throw new SignupsPathError('invalid_signup', 'signup row must be an object');
  }
  const source =
    row.source != null
      ? String(row.source).trim()
      : defaults.source != null
        ? String(defaults.source).trim()
        : '';
  const env =
    row.env != null
      ? String(row.env).trim()
      : defaults.env != null
        ? String(defaults.env).trim()
        : '';
  const advertiserId = String(
    row.advertiserId != null
      ? row.advertiserId
      : row.merchantId != null
        ? row.merchantId
        : '',
  ).trim();
  const company_name = String(
    row.company_name != null
      ? row.company_name
      : row.merchantName != null
        ? row.merchantName
        : '',
  ).trim();
  const email = String(row.email != null ? row.email : '')
    .trim()
    .toLowerCase();
  const user_id = String(row.user_id != null ? row.user_id : '').trim();
  const onboardedAt = String(
    row.onboardedAt != null
      ? row.onboardedAt
      : row.signedUpAt != null
        ? row.signedUpAt
        : new Date().toISOString(),
  );
  const status = String(row.status != null ? row.status : 'joined').trim();

  let id =
    row.id != null
      ? String(row.id).trim()
      : row.signupId != null
        ? String(row.signupId).trim()
        : '';
  if (!id) {
    const h = createHash('sha256')
      .update([source, env, advertiserId, user_id, email, onboardedAt].join('|'))
      .digest('hex')
      .slice(0, 16);
    id = `sig_${h}`;
  }

  /** @type {Record<string, unknown>} */
  const out = {
    id,
    source,
    env,
    user_id,
    company_name,
    email,
    advertiserId,
    onboardedAt,
    status,
  };
  if (row.website != null) out.website = String(row.website);
  if (row.logoUrl != null) out.logoUrl = String(row.logoUrl);
  if (row.primarySector != null) out.primarySector = String(row.primarySector);
  if (row.description != null) out.description = String(row.description);
  // aliases for onboarding-agents minimum
  out.merchantId = advertiserId;
  out.merchantName = company_name;
  out.signedUpAt = onboardedAt;
  return out;
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isNoSuchKey(err) {
  if (!err || typeof err !== 'object') return false;
  const e = /** @type {{ name?: string, Code?: string, code?: string, $metadata?: { httpStatusCode?: number } }} */ (
    err
  );
  return (
    e.name === 'NoSuchKey' ||
    e.Code === 'NoSuchKey' ||
    e.code === 'NoSuchKey' ||
    e.$metadata?.httpStatusCode === 404
  );
}

/**
 * @param {{
 *   Bucket: string,
 *   Key: string,
 *   Body?: { transformToString?: () => Promise<string> },
 * }} res
 */
async function bodyToString(res) {
  if (res && res.Body && typeof res.Body.transformToString === 'function') {
    return res.Body.transformToString();
  }
  if (res && typeof res.Body === 'string') return res.Body;
  throw new SignupsPathError('invalid_get_body', 'getObject Body unreadable');
}

/**
 * @param {object} opts
 * @returns {Promise<{ env: string, source: string, day: string, signups: object[] }>}
 */
async function readSignupEvents(opts = {}) {
  const envVars = opts.envVars || process.env;
  const bucket =
    envVars.S3_RESULTS_BUCKET != null
      ? String(envVars.S3_RESULTS_BUCKET).trim()
      : '';
  if (!bucket) {
    throw new SignupsPathError(
      'missing_bucket',
      'S3_RESULTS_BUCKET is required',
    );
  }
  const env = opts.env;
  const source = opts.source == null ? '' : String(opts.source).trim();
  const day = dayStamp(opts.day);
  const key = signupsKey({ env, source, day });

  const getObject =
    typeof opts.getObject === 'function'
      ? opts.getObject
      : defaultGetObject({ createS3Client: opts.createS3Client });

  try {
    const res = await getObject({ Bucket: bucket, Key: key });
    const raw = await bodyToString(res);
    const parsed = JSON.parse(raw);
    const signups = Array.isArray(parsed.signups) ? parsed.signups : [];
    return {
      env: parsed.env || env,
      source: parsed.source || source,
      day: parsed.day || day,
      signups,
    };
  } catch (err) {
    if (isNoSuchKey(err)) {
      return { env, source, day, signups: [] };
    }
    throw err;
  }
}

/**
 * Append/merge signup events into the day's S3 JSON object.
 *
 * @param {object} opts
 * @param {string} opts.env
 * @param {string} opts.source
 * @param {string|Date} [opts.day]
 * @param {object[]} opts.signups
 * @param {Record<string, string|undefined>} [opts.envVars]
 * @param {Function} [opts.putObject]
 * @param {Function} [opts.getObject]
 * @returns {Promise<{
 *   bucket: string,
 *   key: string,
 *   day: string,
 *   written: object[],
 *   signups: object[],
 * }>}
 */
async function writeSignupEvents(opts = {}) {
  const envVars = opts.envVars || process.env;
  const bucket =
    envVars.S3_RESULTS_BUCKET != null
      ? String(envVars.S3_RESULTS_BUCKET).trim()
      : '';
  if (!bucket) {
    throw new SignupsPathError(
      'missing_bucket',
      'S3_RESULTS_BUCKET is required',
    );
  }
  const env = opts.env;
  const source = opts.source == null ? '' : String(opts.source).trim();
  if (!source) {
    throw new SignupsPathError('empty_source', 'source is required');
  }
  const day = dayStamp(opts.day);
  const key = signupsKey({ env, source, day });

  const incoming = Array.isArray(opts.signups) ? opts.signups : [];
  const written = incoming.map((r) =>
    normalizeSignup(r, { source, env }),
  );

  const existing = await readSignupEvents({
    env,
    source,
    day,
    envVars,
    getObject: opts.getObject,
    createS3Client: opts.createS3Client,
  });

  /** @type {Map<string, object>} */
  const byId = new Map();
  for (const row of existing.signups) {
    const n = normalizeSignup(row, { source, env });
    byId.set(n.id, n);
  }
  for (const row of written) {
    byId.set(row.id, row);
  }
  const signups = [...byId.values()];

  const body = { env, source, day, signups };
  const putObject =
    typeof opts.putObject === 'function'
      ? opts.putObject
      : defaultPutObject({ createS3Client: opts.createS3Client });

  await putObject({
    Bucket: bucket,
    Key: key,
    Body: JSON.stringify(body),
    ContentType: 'application/json',
  });

  return { bucket, key, day, written, signups };
}

module.exports = {
  writeSignupEvents,
  readSignupEvents,
  normalizeSignup,
  createMemorySignupsStore,
  SignupsPathError,
  signupsKey,
  dayStamp,
};
