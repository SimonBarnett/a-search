#!/usr/bin/env node
'use strict';

/**
 * FR-144 / FR-194 / FR #4888: post-deploy smoke - IAM SigV4 POST /search (200 accept)
 * + GET /selftest (JSON shape). No JWT. Default AWS credential chain.
 *
 *   node scripts/smoke-deploy.js --url https://xxxx.execute-api...
 *   node scripts/smoke-deploy.js --stack ASearchStack --region eu-west-2
 *
 * Never prints credentials. Out of scope: CI hitting production without approval.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  defaultCredentials,
  requireCredentials,
  regionFromExecuteApiHost,
  signExecuteApiRequest,
} = require('./awsExecuteApiSigV4');

const DEFAULT_SEARCH_BODY = {
  q: 'a-search smoke fixture',
  catalogId: 1,
  category: 'Smoke',
  subcategory: 'Fixture',
  sandbox: true,
};

function normalizeBaseUrl(baseUrl) {
  const s = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!s) {
    throw new Error(
      'FR-144: missing API base URL (pass --url, A_SEARCH_API_URL, or --stack SearchApiUrl)',
    );
  }
  if (!/^https?:\/\//i.test(s)) {
    throw new Error(`FR-144: API base URL must be http(s): ${s}`);
  }
  return s;
}

function assertSearchAccept(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('FR-144: /search body must be a JSON object');
  }
  const o = /** @type {Record<string, unknown>} */ (body);
  if (o.accepted !== true) {
    throw new Error(
      `FR-144: /search expected accepted:true, got ${JSON.stringify(o.accepted)}`,
    );
  }
  if (typeof o.searchId !== 'string' || !o.searchId) {
    throw new Error('FR-144: /search missing searchId string');
  }
}

function assertSelftestShape(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('FR-144: /selftest body must be a JSON object');
  }
  const o = /** @type {Record<string, unknown>} */ (body);
  if (typeof o.ok !== 'boolean') {
    throw new Error('FR-144: /selftest missing boolean ok');
  }
  if (!Array.isArray(o.providers)) {
    throw new Error('FR-144: /selftest missing providers array');
  }
  for (const row of o.providers) {
    if (!row || typeof row !== 'object') {
      throw new Error('FR-144: /selftest providers row must be an object');
    }
    const r = /** @type {Record<string, unknown>} */ (row);
    if (typeof r.id !== 'string' || !r.id) {
      throw new Error('FR-144: /selftest providers[].id must be a string');
    }
    if (typeof r.ok !== 'boolean') {
      throw new Error(`FR-144: /selftest providers[${r.id}].ok must be boolean`);
    }
  }
}

function defaultDescribeStacks({ stackName, region }) {
  const args = [
    'cloudformation',
    'describe-stacks',
    '--stack-name',
    stackName,
    '--output',
    'json',
  ];
  if (region) args.push('--region', region);
  const r = spawnSync('aws', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(
      `FR-4888: describe-stacks ${stackName} failed (exit ${r.status})`,
    );
  }
  return JSON.parse(r.stdout || '{}');
}

async function resolveSearchApiUrl(opts) {
  const stackName = String((opts && opts.stackName) || 'ASearchStack').trim();
  const region = opts && opts.region ? String(opts.region).trim() : undefined;
  const describe =
    (opts && opts.describeStacks) || defaultDescribeStacks;
  const data = await Promise.resolve(describe({ stackName, region }));
  const stacks = (data && data.Stacks) || [];
  const outputs = (stacks[0] && stacks[0].Outputs) || [];
  const row = outputs.find((o) => o && o.OutputKey === 'SearchApiUrl');
  const url = row && row.OutputValue ? String(row.OutputValue).trim() : '';
  if (!url) {
    throw new Error(
      `FR-4888: stack ${stackName} has no SearchApiUrl output`,
    );
  }
  return url.replace(/\/+$/, '');
}

function regionEnvSuffix(region) {
  return String(region || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function resolveSmokeTarget(opts) {
  const env = (opts && opts.env) || process.env;
  const regionRaw =
    (opts && opts.region) || env.A_SEARCH_SMOKE_REGION || undefined;
  const region =
    regionRaw !== undefined && String(regionRaw).trim() !== ''
      ? String(regionRaw).trim()
      : undefined;
  let baseUrl = opts && opts.url ? String(opts.url).trim() : '';
  if (!baseUrl && region) {
    const suf = regionEnvSuffix(region);
    if (suf) {
      const keyed = env[`A_SEARCH_API_URL_${suf}`];
      if (keyed) baseUrl = String(keyed).trim();
    }
  }
  if (!baseUrl) {
    baseUrl = env.A_SEARCH_API_URL ? String(env.A_SEARCH_API_URL).trim() : '';
  }
  return { baseUrl: baseUrl || undefined, region };
}

function signedHeaders(opts) {
  return signExecuteApiRequest({
    method: opts.method,
    url: opts.url,
    body: opts.body,
    credentials: requireCredentials(
      opts.credentials || defaultCredentials(opts.env),
    ),
    region: opts.region,
    now: opts.now,
    extraHeaders: opts.extraHeaders,
  });
}

async function runSmoke(opts) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('FR-144: fetch is not available');
  }
  const base = normalizeBaseUrl(opts.baseUrl);
  const searchBody = opts.searchBody || DEFAULT_SEARCH_BODY;
  const body = JSON.stringify(searchBody);
  const searchUrl = `${base}/search`;
  const creds = opts.credentials || defaultCredentials(opts.env);
  const region =
    opts.region || regionFromExecuteApiHost(new URL(base).host) || undefined;
  const searchHeaders = signedHeaders({
    method: 'POST',
    url: searchUrl,
    body,
    credentials: creds,
    region,
    now: opts.now,
    extraHeaders: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    env: opts.env,
  });

  const searchRes = await fetchImpl(searchUrl, {
    method: 'POST',
    headers: searchHeaders,
    body,
  });
  const searchText = await searchRes.text();
  let searchJson;
  try {
    searchJson = searchText ? JSON.parse(searchText) : null;
  } catch {
    throw new Error(
      `FR-144: /search HTTP ${searchRes.status} non-JSON body (${searchText.slice(0, 120)})`,
    );
  }
  if (searchRes.status !== 200) {
    throw new Error(
      `FR-144: /search expected HTTP 200, got ${searchRes.status} ${JSON.stringify(searchJson)}`,
    );
  }
  assertSearchAccept(searchJson);

  const selfUrl = `${base}/selftest?sandbox=true`;
  const selfHeaders = signedHeaders({
    method: 'GET',
    url: selfUrl,
    body: '',
    credentials: creds,
    region,
    now: opts.now,
    extraHeaders: { accept: 'application/json' },
    env: opts.env,
  });
  const selfRes = await fetchImpl(selfUrl, {
    method: 'GET',
    headers: selfHeaders,
  });
  const selfText = await selfRes.text();
  let selfJson;
  try {
    selfJson = selfText ? JSON.parse(selfText) : null;
  } catch {
    throw new Error(
      `FR-144: /selftest HTTP ${selfRes.status} non-JSON body (${selfText.slice(0, 120)})`,
    );
  }
  if (selfRes.status !== 200) {
    throw new Error(
      `FR-144: /selftest expected HTTP 200, got ${selfRes.status} ${JSON.stringify(selfJson)}`,
    );
  }
  assertSelftestShape(selfJson);

  return {
    ok: true,
    searchId: searchJson.searchId,
    selftestOk: selfJson.ok,
    providers: selfJson.providers.length,
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
  // FR #5096: persist SearchApiUrl for tools/search.ps1 (annotator may lack DescribeStacks
  // until CDK policy lands; EXAMPLE placeholder is skipped by Resolve-SearchEndpoint).
  // Write under ProgramData so the git work tree stays clean.
  try {
    const dir = path.join(
      process.env.ProgramData || 'C:\\ProgramData',
      'a-search',
    );
    fs.mkdirSync(dir, { recursive: true });
    const cfgPath = path.join(dir, 'folder-tools.config.json');
    const doc = {
      SearchApiUrl: String(baseUrl).replace(/\/$/, ''),
      AwsProfile: 'a-search-redqueen-annotator',
      SearchStackName: stack,
    };
    fs.writeFileSync(cfgPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  } catch (_) {
    /* best-effort; smoke still proceeds */
  }
  const result = await runSmoke({
    baseUrl,
    region,
    env: process.env,
  });
  if (region) result.region = region;
  process.stdout.write(JSON.stringify(result) + '\n');
}

module.exports = {
  runSmoke,
  normalizeBaseUrl,
  assertSearchAccept,
  assertSelftestShape,
  resolveSmokeTarget,
  resolveSearchApiUrl,
  regionEnvSuffix,
  DEFAULT_SEARCH_BODY,
};

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(
      (err && err.message ? err.message : String(err)) + '\n',
    );
    process.exit(1);
  });
}
