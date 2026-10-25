'use strict';

/**
 * FR #4888: SigV4 sign execute-api HTTP requests (default credential chain).
 * Never logs secrets.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function amzDateFrom(now) {
  const d = now instanceof Date ? now : new Date();
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function regionFromExecuteApiHost(host) {
  const m = String(host || '').match(/\.execute-api\.([a-z0-9-]+)\.amazonaws\.com$/i);
  return m ? m[1] : '';
}

/**
 * Env then shared credentials file (default profile). No IMDS in unit tests.
 * @param {NodeJS.ProcessEnv} [env]
 */
function defaultCredentials(env) {
  const e = env || process.env;
  const accessKeyId = String(e.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(e.AWS_SECRET_ACCESS_KEY || '').trim();
  const sessionToken = String(e.AWS_SESSION_TOKEN || '').trim() || undefined;
  if (accessKeyId && secretAccessKey) {
    return { accessKeyId, secretAccessKey, sessionToken };
  }
  const file =
    e.AWS_SHARED_CREDENTIALS_FILE ||
    path.join(os.homedir(), '.aws', 'credentials');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const profile = String(e.AWS_PROFILE || 'default').trim() || 'default';
    const block = raw.split(/^\s*\[/m).find((p) => p.startsWith(profile + ']'));
    if (!block) return null;
    const ak = (block.match(/^\s*aws_access_key_id\s*=\s*(\S+)/im) || [])[1];
    const sk = (block.match(/^\s*aws_secret_access_key\s*=\s*(\S+)/im) || [])[1];
    const tok = (block.match(/^\s*aws_session_token\s*=\s*(\S+)/im) || [])[1];
    if (ak && sk) {
      return { accessKeyId: ak, secretAccessKey: sk, sessionToken: tok };
    }
  } catch {
    /* no file */
  }
  return null;
}

function requireCredentials(creds) {
  if (!creds || !creds.accessKeyId || !creds.secretAccessKey) {
    throw new Error(
      'FR-4888: missing AWS credentials (default chain: AWS_ACCESS_KEY_ID / shared credentials file)',
    );
  }
  return creds;
}

/**
 * @param {{
 *   method: string,
 *   url: string,
 *   body?: string,
 *   credentials: { accessKeyId: string, secretAccessKey: string, sessionToken?: string },
 *   region?: string,
 *   now?: Date | (() => Date),
 *   extraHeaders?: Record<string, string>,
 * }} opts
 */
function signExecuteApiRequest(opts) {
  const creds = requireCredentials(opts.credentials);
  const parsed = new URL(opts.url);
  const host = parsed.host;
  const region =
    String(opts.region || '').trim() ||
    regionFromExecuteApiHost(host) ||
    'eu-west-2';
  const method = String(opts.method || 'GET').toUpperCase();
  const body = opts.body != null ? String(opts.body) : '';
  const nowFn = opts.now;
  const now =
    typeof nowFn === 'function' ? nowFn() : nowFn instanceof Date ? nowFn : new Date();
  const amzDate = amzDateFrom(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const extra = opts.extraHeaders || {};
  const headers = {
    host,
    'x-amz-date': amzDate,
    ...extra,
  };
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    headers['content-type'] = extra['content-type'] || extra['Content-Type'] || 'application/json';
  }
  if (creds.sessionToken) {
    headers['x-amz-security-token'] = creds.sessionToken;
  }
  const signedNames = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders = signedNames
    .map((n) => {
      const key = Object.keys(headers).find((k) => k.toLowerCase() === n);
      return `${n}:${String(headers[key]).trim()}\n`;
    })
    .join('');
  const signedHeaders = signedNames.join(';');
  const canonicalQuery = parsed.search ? parsed.search.slice(1) : '';
  const canonicalRequest = [
    method,
    parsed.pathname || '/',
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/execute-api/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const kDate = hmac(`AWS4${creds.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 'execute-api');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');
  headers.Authorization =
    `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

module.exports = {
  defaultCredentials,
  requireCredentials,
  regionFromExecuteApiHost,
  signExecuteApiRequest,
};
