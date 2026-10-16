'use strict';

/**
 * FR-197: idempotent S3/local customer tree bootstrap (widgetGuid, not uri-slug).
 * First host sight -> _host.json. First widget bind -> widget.json + live.json=[] + searches.json.
 * Paths only via widgetPath.js. Existing files are never rewritten.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  assertWidgetGuid,
  hostDir,
  widgetDir,
  widgetFile,
} = require('./widgetPath');
const { ensureHostFolderMarker } = require('./hostFolderMeta');

/**
 * Resolve a forward-slash key under an OS root.
 * @param {string} root
 * @param {string} key
 * @returns {string}
 */
function underRoot(root, key) {
  const parts = String(key).split('/').filter(Boolean);
  return path.join(root, ...parts);
}

/**
 * Write JSON only if the file does not already exist.
 * @param {string} absPath
 * @param {unknown} value
 * @returns {boolean} true when created
 */
function writeJsonIfAbsent(absPath, value) {
  if (fs.existsSync(absPath)) return false;
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  // exclusive create: second concurrent call must not rewrite
  let fd;
  try {
    fd = fs.openSync(absPath, 'wx');
  } catch (err) {
    if (err && (err.code === 'EEXIST' || err.code === 'EPERM')) return false;
    throw err;
  }
  try {
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
  return true;
}

/**
 * Injected S3 client for the zero-byte host folder marker (FR #3490 / FR-3373).
 * `opts.s3` or `opts.putObject` (plus optional head / tagging). Absent means local only.
 * @param {object} opts
 * @returns {{ putObject: Function, headObject?: Function, putObjectTagging?: Function }|null}
 */
function markerClient(opts) {
  const s3 = opts.s3;
  if (s3 && typeof s3 === 'object' && typeof s3.putObject === 'function') {
    return {
      putObject: (args) => s3.putObject(args),
      headObject:
        typeof s3.headObject === 'function'
          ? (args) => s3.headObject(args)
          : undefined,
      putObjectTagging:
        typeof s3.putObjectTagging === 'function'
          ? (args) => s3.putObjectTagging(args)
          : undefined,
    };
  }
  if (typeof opts.putObject === 'function') {
    return {
      putObject: opts.putObject,
      headObject: opts.headObject,
      putObjectTagging: opts.putObjectTagging,
    };
  }
  return null;
}

/**
 * First sight of a host: create {env}/x/{customerNumber}/_host.json.
 * Does not write site.md (agent-owned, FR-204).
 * When an S3 client is injected, also puts the zero-byte folder marker
 * (userid metadata, hasdns/partnerid/hasupg tags) and returns a Promise.
 * Local-only calls stay synchronous. The tree is not renamed to the host URL.
 * @param {{
 *   root: string,
 *   env: string,
 *   customerNumber: string|number,
 *   host: string,
 *   userId?: string,
 *   hasdns?: boolean|string|number,
 *   partnerid?: string|null,
 *   hasupg?: boolean|string|number,
 *   putObject?: Function,
 *   headObject?: Function,
 *   putObjectTagging?: Function,
 *   s3?: object,
 * }} opts
 * @returns {{ created: boolean, path: string }|Promise<{ created: boolean, path: string, marker: object }>}
 */
function bootstrapHost(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('bootstrap_host_opts_required');
  }
  const root = opts.root == null ? '' : String(opts.root);
  if (!root) throw new Error('empty_root');
  const host = opts.host == null ? '' : String(opts.host).trim();
  if (!host) throw new Error('empty_host');

  const key = `${hostDir(opts.env, opts.customerNumber)}/_host.json`;
  const abs = underRoot(root, key);
  const doc = {
    host,
    customerNumber: String(opts.customerNumber).trim(),
    createdAt: new Date().toISOString(),
  };
  const created = writeJsonIfAbsent(abs, doc);
  const result = { created, path: abs };
  const client = markerClient(opts);
  if (!client) return result;
  return ensureHostFolderMarker({
    env: opts.env,
    customerNumber: opts.customerNumber,
    host,
    userId: opts.userId,
    hasdns: opts.hasdns,
    partnerid: opts.partnerid,
    hasupg: opts.hasupg,
    putObject: client.putObject,
    headObject: client.headObject,
    putObjectTagging: client.putObjectTagging,
  }).then((marker) => ({ ...result, marker }));
}

/**
 * First bind of a widgetGuid: widget.json + live.json=[] + searches.json.
 * Idempotent: existing widget.json / live.json / searches.json are left alone.
 * @param {{
 *   root: string,
 *   env: string,
 *   customerNumber: string|number,
 *   widgetGuid: string,
 *   host: string,
 *   layout?: string,
 *   createdVia?: string,
 * }} opts
 * @returns {{ created: boolean, widgetPath: string }}
 */
function bootstrapWidget(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('bootstrap_widget_opts_required');
  }
  const root = opts.root == null ? '' : String(opts.root);
  if (!root) throw new Error('empty_root');
  const host = opts.host == null ? '' : String(opts.host).trim();
  if (!host) throw new Error('empty_host');
  const guid = assertWidgetGuid(opts.widgetGuid);
  const layout =
    opts.layout == null || opts.layout === ''
      ? 'horizontal'
      : String(opts.layout).trim();
  const createdVia =
    opts.createdVia == null || opts.createdVia === ''
      ? 'extension'
      : String(opts.createdVia).trim();

  // ensure directory exists even when all files already present
  const dirAbs = underRoot(
    root,
    widgetDir(opts.env, opts.customerNumber, guid),
  );
  fs.mkdirSync(dirAbs, { recursive: true });

  const widgetKey = widgetFile(
    opts.env,
    opts.customerNumber,
    guid,
    'widget.json',
  );
  const liveKey = widgetFile(
    opts.env,
    opts.customerNumber,
    guid,
    'live.json',
  );
  const searchesKey = widgetFile(
    opts.env,
    opts.customerNumber,
    guid,
    'searches.json',
  );

  const widgetAbs = underRoot(root, widgetKey);
  const liveAbs = underRoot(root, liveKey);
  const searchesAbs = underRoot(root, searchesKey);

  const widgetDoc = {
    widgetGuid: guid,
    host,
    customerNumber: String(opts.customerNumber).trim(),
    layout,
    createdVia,
    createdAt: new Date().toISOString(),
  };

  const createdWidget = writeJsonIfAbsent(widgetAbs, widgetDoc);
  writeJsonIfAbsent(liveAbs, []);
  writeJsonIfAbsent(searchesAbs, { queries: [], exclude: [] });

  // created === true only when widget.json was newly written (event marker)
  return { created: createdWidget, widgetPath: widgetAbs };
}

module.exports = {
  bootstrapHost,
  bootstrapWidget,
};
