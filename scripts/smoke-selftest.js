#!/usr/bin/env node
'use strict';

/**
 * FR #4882 / FR #4888: UAT S19 IAM SigV4 GET then POST /selftest.
 * No JWT. Default AWS credential chain.
 *
 *   node scripts/smoke-selftest.js --url https://xxxx.execute-api...
 *   node scripts/smoke-selftest.js --stack ASearchStack
 *
 * Never prints credentials.
 */

const {
  normalizeBaseUrl,
  assertSelftestShape,
  resolveSmokeTarget,
  resolveSearchApiUrl,
} = require('./smoke-deploy.js');
const {
  defaultCredentials,
  requireCredentials,
  regionFromExecuteApiHost,
  signExecuteApiRequest,
} = require('./awsExecuteApiSigV4');

function parseJson(text, status, verb) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `FR-4882: ${verb} /selftest HTTP ${status} non-JSON body (${String(text).slice(0, 120)})`,
    );
  }
}

async function fetchSelftest(fetchImpl, url, init, verb) {
  const res = await fetchImpl(url, init);
  const text = await res.text();
  const json = parseJson(text, res.status, verb);
  if (res.status !== 200) {
    throw new Error(
      `FR-4882: ${verb} /selftest expected HTTP 200, got ${res.status} ${JSON.stringify(json)}`,
    );
  }
  assertSelftestShape(json);
  return json;
}

async function runSelftestSmoke(opts) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('FR-4882: fetch is not available');
  }
  const base = normalizeBaseUrl(opts.baseUrl);
  const creds = requireCredentials(
    opts.credentials || defaultCredentials(opts.env),
  );
  const region =
    opts.region || regionFromExecuteApiHost(new URL(base).host) || undefined;

  const getUrl = base + '/selftest?sandbox=true';
  const getHeaders = signExecuteApiRequest({
    method: 'GET',
    url: getUrl,
    body: '',
    credentials: creds,
    region,
    now: opts.now,
    extraHeaders: { accept: 'application/json' },
  });
  const getJson = await fetchSelftest(
    fetchImpl,
    getUrl,
    { method: 'GET', headers: getHeaders },
    'GET',
  );

  const postUrl = base + '/selftest';
  const postBody = JSON.stringify({ sandbox: true });
  const postHeaders = signExecuteApiRequest({
    method: 'POST',
    url: postUrl,
    body: postBody,
    credentials: creds,
    region,
    now: opts.now,
    extraHeaders: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
  });
  const postJson = await fetchSelftest(
    fetchImpl,
    postUrl,
    { method: 'POST', headers: postHeaders, body: postBody },
    'POST',
  );

  return {
    ok: true,
    selftestOk: Boolean(getJson.ok && postJson.ok),
    providers: Array.isArray(getJson.providers) ? getJson.providers.length : 0,
  };
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

async function main() {
  const stack = argValue('--stack') || process.env.A_SEARCH_STACK || 'ASearchStack';
  const { baseUrl: fromEnv, region } = resolveSmokeTarget({
    url: argValue('--url'),
    region: argValue('--region'),
  });
  let baseUrl = fromEnv;
  if (!baseUrl) {
    baseUrl = await resolveSearchApiUrl({ stackName: stack, region });
  }
  const result = await runSelftestSmoke({
    baseUrl,
    region,
    env: process.env,
  });
  if (region) result.region = region;
  process.stdout.write(JSON.stringify(result) + '\n');
}

module.exports = {
  runSelftestSmoke,
};

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(
      (err && err.message ? err.message : String(err)) + '\n',
    );
    process.exit(1);
  });
}
