#!/usr/bin/env node
'use strict';

/**
 * FR-232 rule 8: one-shot migrate uri-slug folders to widgetGuid folders.
 * Default --dry-run. --apply copies, writes widget.json + registry, deletes old.
 * UUID v5 of "{host}\n{uri-slug}" under fixed namespace (deterministic, re-run safe).
 *
 * Usage:
 *   node scripts/migrate-uri-to-guid.js --root <path> --env sandbox|live [--apply]
 *   [--host <host>] [--customer <n>] [--store-json <file>]
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  assertWidgetGuid,
  hostDir,
  widgetDir,
  widgetFile,
} = require('../shared/widgets/widgetPath');
const {
  MemoryCustomersStore,
  getWidget,
} = require('../shared/components/customers');

/** Fixed RFC 4122 namespace UUID for uri-slug -> widgetGuid v5 (committed). */
const URI_TO_GUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const HOST_LEVEL_FILES = new Set(['_host.json', 'site.md', 'top10.json']);

/**
 * @param {string} hex 32 lowercase hex chars
 * @param {number} version 4 or 5
 */
function uuidFromHash(hex, version) {
  const bytes = Buffer.from(hex.slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | (version << 4);
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = bytes.toString('hex');
  return (
    h.slice(0, 8) +
    '-' +
    h.slice(8, 12) +
    '-' +
    h.slice(12, 16) +
    '-' +
    h.slice(16, 20) +
    '-' +
    h.slice(20, 32)
  );
}

/**
 * @param {string} namespaceUuid
 * @returns {Buffer}
 */
function namespaceToBytes(namespaceUuid) {
  const hex = String(namespaceUuid).replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error('invalid_namespace_uuid');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * RFC 4122 UUID v5 (SHA-1).
 * @param {string} name
 * @param {string} [namespaceUuid]
 * @returns {string} lowercase uuid
 */
function uuidV5(name, namespaceUuid = URI_TO_GUID_NAMESPACE) {
  const ns = namespaceToBytes(namespaceUuid);
  const hash = crypto.createHash('sha1');
  hash.update(ns);
  hash.update(String(name), 'utf8');
  return uuidFromHash(hash.digest('hex'), 5);
}

/**
 * @param {string} host
 * @param {string} uriSlug
 * @returns {string}
 */
function widgetGuidForUriSlug(host, uriSlug) {
  return uuidV5(`${String(host).trim().toLowerCase()}\n${String(uriSlug)}`);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function looksLikeGuid(name) {
  try {
    assertWidgetGuid(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} absHostDir
 * @returns {string[]} non-GUID child folder names (uri-slugs)
 */
function listUriSlugFolders(absHostDir) {
  if (!fs.existsSync(absHostDir)) return [];
  return fs
    .readdirSync(absHostDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => n !== '_migration' && !looksLikeGuid(n));
}

/**
 * Recursive copy (files + dirs).
 * @param {string} src
 * @param {string} dest
 */
function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * @param {string} dir
 */
function rmTree(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * @param {object} opts
 * @returns {{ dryRun: boolean, planned: object[], applied: object[] }}
 */
function migrateUriToGuid(opts) {
  const root = String(opts.root || '');
  if (!root) throw new Error('root_required');
  const env = opts.env === 'live' ? 'live' : 'sandbox';
  const apply = opts.apply === true;
  const store = opts.store || new MemoryCustomersStore();
  const onlyCustomer =
    opts.customerNumber != null ? String(opts.customerNumber) : null;
  const hostOverride =
    opts.host != null && String(opts.host).trim()
      ? String(opts.host).trim().toLowerCase()
      : null;

  const planned = [];
  const applied = [];

  const prefix = path.join(root, ...hostDir(env, '0').split('/').slice(0, -1));
  // physicalPrefix = env/x ; scan customer dirs under root/env/x
  const envRoot = path.join(root, env, 'x');
  if (!fs.existsSync(envRoot)) {
    return { dryRun: !apply, planned, applied, envRoot };
  }

  for (const custName of fs.readdirSync(envRoot, { withFileTypes: true })) {
    if (!custName.isDirectory()) continue;
    if (onlyCustomer && custName.name !== onlyCustomer) continue;
    const absHost = path.join(envRoot, custName.name);
    const hostJsonPath = path.join(absHost, '_host.json');
    let host = hostOverride;
    if (!host && fs.existsSync(hostJsonPath)) {
      try {
        const doc = JSON.parse(fs.readFileSync(hostJsonPath, 'utf8'));
        if (doc && doc.host) host = String(doc.host).trim().toLowerCase();
      } catch {
        /* ignore */
      }
    }
    if (!host) host = `unknown-host-${custName.name}`;

    const slugs = listUriSlugFolders(absHost);
    for (const uriSlug of slugs) {
      const widgetGuid = widgetGuidForUriSlug(host, uriSlug);
      const entry = {
        customerNumber: custName.name,
        host,
        uriSlug,
        widgetGuid,
        src: path.join(absHost, uriSlug),
        dest: path.join(root, ...widgetDir(env, custName.name, widgetGuid).split('/')),
      };
      planned.push(entry);

      if (!apply) continue;

      if (fs.existsSync(entry.dest)) {
        applied.push({ ...entry, action: 'skip_exists' });
        continue;
      }

      copyTree(entry.src, entry.dest);

      const widgetJsonKey = widgetFile(
        env,
        custName.name,
        widgetGuid,
        'widget.json',
      );
      const widgetJsonAbs = path.join(root, ...widgetJsonKey.split('/'));
      if (!fs.existsSync(widgetJsonAbs)) {
        const doc = {
          widgetGuid,
          host,
          customerNumber: String(custName.name),
          layout: 'horizontal',
          createdVia: 'migration',
          createdAt: new Date().toISOString(),
        };
        fs.mkdirSync(path.dirname(widgetJsonAbs), { recursive: true });
        fs.writeFileSync(widgetJsonAbs, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
      }

      if (!getWidget(store, widgetGuid)) {
        const now = new Date().toISOString();
        const customerNumber = String(custName.name);
        if (!store.byHost.get(host)) {
          const crow = {
            customerNumber,
            host,
            approved: false,
            clubId: null,
            partnerId: null,
            dnsCheckedAt: null,
            upgradeStatus: 'none',
            upgradeSubscriptionId: null,
            upgradeCheckedAt: null,
            createdAt: now,
            updatedAt: now,
          };
          store.byHost.set(host, crow);
          store.byNumber.set(customerNumber, crow);
        }
        store.widgets.set(widgetGuid, {
          widgetGuid,
          customerNumber,
          host,
          layout: 'horizontal',
          createdVia: 'migration',
          createdByUserId: null,
          createdAt: now,
          boundAt: now,
          status: 'active',
        });
      }

      const migDir = path.join(absHost, '_migration');
      fs.mkdirSync(migDir, { recursive: true });
      const migPath = path.join(migDir, 'uri-to-guid.json');
      /** @type {object[]} */
      let log = [];
      if (fs.existsSync(migPath)) {
        try {
          log = JSON.parse(fs.readFileSync(migPath, 'utf8'));
          if (!Array.isArray(log)) log = [];
        } catch {
          log = [];
        }
      }
      if (!log.some((e) => e && e.uriSlug === uriSlug && e.widgetGuid === widgetGuid)) {
        log.push({
          uriSlug,
          widgetGuid,
          migratedAt: new Date().toISOString(),
        });
        fs.writeFileSync(migPath, `${JSON.stringify(log, null, 2)}\n`, 'utf8');
      }

      rmTree(entry.src);
      applied.push({ ...entry, action: 'migrated' });
    }
  }

  void HOST_LEVEL_FILES;
  void prefix;
  return { dryRun: !apply, planned, applied, envRoot };
}

function parseArgs(argv) {
  const out = {
    root: '',
    env: 'sandbox',
    apply: false,
    host: null,
    customerNumber: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--dry-run') out.apply = false;
    else if (a === '--root') out.root = argv[++i];
    else if (a === '--env') out.env = argv[++i];
    else if (a === '--host') out.host = argv[++i];
    else if (a === '--customer') out.customerNumber = argv[++i];
  }
  return out;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.root) {
    console.error(
      'Usage: node scripts/migrate-uri-to-guid.js --root <path> [--env sandbox|live] [--apply]',
    );
    process.exitCode = 2;
    return;
  }
  const result = migrateUriToGuid(args);
  const payload = {
    dryRun: result.dryRun,
    count: result.planned.length,
    planned: result.planned.map((p) => ({
      customerNumber: p.customerNumber,
      host: p.host,
      uriSlug: p.uriSlug,
      widgetGuid: p.widgetGuid,
    })),
    applied: result.applied.map((p) => ({
      uriSlug: p.uriSlug,
      widgetGuid: p.widgetGuid,
      action: p.action,
    })),
  };
  console.log(JSON.stringify(payload, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  URI_TO_GUID_NAMESPACE,
  uuidV5,
  widgetGuidForUriSlug,
  listUriSlugFolders,
  migrateUriToGuid,
  looksLikeGuid,
  main,
};
