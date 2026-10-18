'use strict';

/**
 * FR #3987: redqueen annotation agent --- host review first, then GUID pages.
 * Host-only queue messages; GUID folders discovered via S3 list.
 * Injectable S3 / reviewers / now for tests. No inbound ports.
 */

const { parseFolderEvent } = require('../../shared/aClubs/folderEvents');

/**
 * @param {string} hostkey
 * @returns {string}
 */
function hostAnnotationsKey(hostkey) {
  return `${String(hostkey).replace(/\/+$/, '')}/annotations.json`;
}

/**
 * @param {string} hostkey
 * @param {string} guid
 * @returns {string}
 */
function guidAnnotationsKey(hostkey, guid) {
  return `${String(hostkey).replace(/\/+$/, '')}/${guid}/annotations.json`;
}

/**
 * @param {string} hostkey
 * @param {string} guid
 * @returns {string}
 */
function guidSteeringKey(hostkey, guid) {
  return `${String(hostkey).replace(/\/+$/, '')}/${guid}/steering.json`;
}

/**
 * @param {string} hostkey
 * @returns {string}
 */
function hostMarkerKeyFromHostkey(hostkey) {
  return `${String(hostkey).replace(/\/+$/, '')}/`;
}

/**
 * @param {string} hostkey
 * @param {string} guid
 * @returns {string}
 */
function guidWidgetKey(hostkey, guid) {
  return `${String(hostkey).replace(/\/+$/, '')}/${guid}/widget.json`;
}

/**
 * Default stub reviewer (wire a real Grok/Cursor CLI later --- docs).
 * @param {{ host: string, hostkey: string }} input
 */
async function defaultReviewHost(input) {
  return {
    summary: `Stub review for ${input.host}`,
    categories: ['parts'],
    notes: 'Inject reviewHost for production models.',
    model: 'stub',
  };
}

/**
 * @param {{ host: string, hostkey: string, guid: string, uri?: string, hostAnnotations: object, steering?: object }} input
 */
async function defaultReviewGuid(input) {
  return {
    summary: `Stub page review for ${input.uri || input.guid}`,
    intent: 'browse',
    suggestedQueries: [],
    model: 'stub',
  };
}

/**
 * annotated flag + lastmod vs lastupdate:
 * - no annotated=1 -> needs create
 * - annotated=1 and lastmod > lastupdate -> needs update
 * - annotated=1 and lastmod <= lastupdate -> skip
 * @param {Record<string, string>} md
 * @returns {'create'|'update'|'skip'}
 */
function annotationNeed(md) {
  const meta = md || {};
  if (String(meta.annotated || '') !== '1') return 'create';
  const lastmod = String(meta.lastmod || '').trim();
  const lastupdate = String(meta.lastupdate || '').trim();
  if (!lastupdate) return 'update';
  if (lastmod && lastmod > lastupdate) return 'update';
  return 'skip';
}

/**
 * @param {{
 *   body?: string,
 *   event?: object,
 *   headObject: Function,
 *   getObject?: Function,
 *   putObject: Function,
 *   listObjectsV2?: Function,
 *   copyObject?: Function,
 *   reviewHost?: Function,
 *   reviewGuid?: Function,
 *   now?: () => Date,
 * }} opts
 * @returns {Promise<{ action: string, detail?: string, host?: string, guids?: object[] }>}
 */
async function processFolderEvent(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('processFolderEvent opts required');
  }
  if (typeof opts.headObject !== 'function' || typeof opts.putObject !== 'function') {
    throw new Error('s3_client_required');
  }
  const event = opts.event
    ? parseFolderEvent(opts.event)
    : parseFolderEvent(opts.body);
  const now = (opts.now || (() => new Date()))().toISOString();
  const reviewHost = opts.reviewHost || defaultReviewHost;
  const reviewGuid = opts.reviewGuid || defaultReviewGuid;

  const markerKey = hostMarkerKeyFromHostkey(event.hostkey);
  const annKey = hostAnnotationsKey(event.hostkey);
  const head = await headOrNull(opts, markerKey);
  if (!head) {
    return { action: 'retry', detail: 'host_marker_missing' };
  }
  const hostMd = (head.Metadata || head.metadata) || {};
  const hostNeed = annotationNeed(hostMd);

  if (hostNeed !== 'skip') {
    try {
      const review = await reviewHost({
        host: event.host,
        hostkey: event.hostkey,
      });
      const doc = {
        host: event.host,
        reviewedAt: now,
        model: review.model || 'stub',
        summary: review.summary || '',
        categories: Array.isArray(review.categories) ? review.categories : [],
        notes: review.notes || '',
      };
      await opts.putObject({
        Key: annKey,
        Body: `${JSON.stringify(doc, null, 2)}\n`,
        ContentType: 'application/json; charset=utf-8',
      });
      // Same timestamp for lastupdate and lastmod so agent write does not loop.
      await putMarkerMetadata(opts, markerKey, hostMd, {
        annotated: '1',
        lastupdate: now,
        lastmod: now,
      });
    } catch (err) {
      const detail = (err && err.message) || 'host_review_failed';
      return { action: 'retry', detail: `host_review_failed:${detail}` };
    }
  }

  const hostAnn = await getJsonOrNull(opts, annKey);
  if (!hostAnn) {
    return { action: 'retry', detail: 'host_annotations_missing' };
  }

  const guids = await listGuidIds(opts, event.hostkey);
  const guidResults = [];
  for (const guid of guids) {
    const result = await annotateOneGuid({
      opts,
      event,
      guid,
      hostAnn,
      reviewGuid,
      now,
    });
    guidResults.push({ guid, ...result });
  }

  return {
    action: 'host_processed',
    host: hostNeed === 'skip' ? 'skipped' : 'annotated',
    guids: guidResults,
  };
}

/**
 * @param {{
 *   opts: object,
 *   event: { hostkey: string, host: string },
 *   guid: string,
 *   hostAnn: object,
 *   reviewGuid: Function,
 *   now: string,
 * }} args
 */
async function annotateOneGuid(args) {
  const { opts, event, guid, hostAnn, reviewGuid, now } = args;
  const widgetKey = guidWidgetKey(event.hostkey, guid);
  const widgetHead = await headOrNull(opts, widgetKey);
  if (!widgetHead) {
    return { action: 'skip', detail: 'widget_missing' };
  }
  const widgetMd =
    (widgetHead.Metadata || widgetHead.metadata) || {};
  const need = annotationNeed(widgetMd);
  if (need === 'skip') {
    return { action: 'noop', detail: 'guid_unchanged' };
  }

  const steering = await getJsonOrNull(
    opts,
    guidSteeringKey(event.hostkey, guid),
  );
  const existingAnn = await getJsonOrNull(
    opts,
    guidAnnotationsKey(event.hostkey, guid),
  );
  const uri =
    String(widgetMd.uri || (existingAnn && existingAnn.uri) || '').trim() ||
    '';

  const review = await reviewGuid({
    host: event.host,
    hostkey: event.hostkey,
    guid,
    uri,
    hostAnnotations: hostAnn,
    steering: steering || undefined,
  });
  const doc = {
    uri,
    annotatedAt: now,
    model: review.model || 'stub',
    summary: review.summary || '',
    intent: review.intent || '',
    suggestedQueries: Array.isArray(review.suggestedQueries)
      ? review.suggestedQueries
      : [],
    steering: steering || null,
  };
  const annKey = guidAnnotationsKey(event.hostkey, guid);
  await opts.putObject({
    Key: annKey,
    Body: `${JSON.stringify(doc, null, 2)}\n`,
    ContentType: 'application/json; charset=utf-8',
  });
  await putMarkerMetadata(opts, widgetKey, widgetMd, {
    annotated: '1',
    lastupdate: now,
    lastmod: now,
    ...(uri ? { uri } : {}),
  });
  return { action: need === 'create' ? 'guid_annotated' : 'guid_updated' };
}

/**
 * Discover GUID folders under hostkey via listObjectsV2.
 * Looks for `{hostkey}/{guid}/widget.json` keys.
 * @param {object} opts
 * @param {string} hostkey
 * @returns {Promise<string[]>}
 */
async function listGuidIds(opts, hostkey) {
  if (typeof opts.listObjectsV2 !== 'function') return [];
  const prefix = `${String(hostkey).replace(/\/+$/, '')}/`;
  const ids = new Set();
  let ContinuationToken;
  do {
    const resp = await opts.listObjectsV2({
      Prefix: prefix,
      ContinuationToken,
    });
    const contents = (resp && resp.Contents) || [];
    for (const item of contents) {
      const Key = item && item.Key;
      if (!Key) continue;
      const rest = Key.slice(prefix.length);
      const m = /^([0-9a-fA-F-]{36})\/widget\.json$/.exec(rest);
      if (m) ids.add(m[1].toLowerCase());
    }
    ContinuationToken = resp && resp.IsTruncated
      ? resp.NextContinuationToken
      : undefined;
  } while (ContinuationToken);
  return [...ids].sort();
}

async function headOrNull(opts, Key) {
  try {
    return await opts.headObject({ Key });
  } catch (err) {
    const status = err && err.$metadata && err.$metadata.httpStatusCode;
    const code = err && (err.name || err.code);
    if (status === 404 || code === 'NotFound' || code === 'NoSuchKey') {
      return null;
    }
    throw err;
  }
}

async function getJsonOrNull(opts, Key) {
  if (typeof opts.getObject !== 'function') return null;
  try {
    const obj = await opts.getObject({ Key });
    let text = '';
    if (obj && obj.Body != null) {
      if (Buffer.isBuffer(obj.Body)) text = obj.Body.toString('utf8');
      else if (typeof obj.Body === 'string') text = obj.Body;
      else if (typeof obj.Body.transformToString === 'function') {
        text = await obj.Body.transformToString();
      } else text = String(obj.Body);
    }
    return JSON.parse(text);
  } catch (err) {
    const status = err && err.$metadata && err.$metadata.httpStatusCode;
    const code = err && (err.name || err.code);
    if (status === 404 || code === 'NotFound' || code === 'NoSuchKey') {
      return null;
    }
    if (err instanceof SyntaxError) return null;
    throw err;
  }
}

/**
 * Rewrite object metadata via get+put when copyObject absent (tests/memory).
 */
async function putMarkerMetadata(opts, Key, prevMd, patch) {
  const Metadata = { ...(prevMd || {}), ...patch };
  for (const k of Object.keys(Metadata)) {
    Metadata[k] = String(Metadata[k]);
  }
  if (typeof opts.copyObject === 'function') {
    await opts.copyObject({
      Key,
      Metadata,
      MetadataDirective: 'REPLACE',
    });
    return;
  }
  let Body = Buffer.alloc(0);
  let ContentType;
  if (typeof opts.getObject === 'function') {
    try {
      const obj = await opts.getObject({ Key });
      if (obj && obj.Body != null) {
        if (Buffer.isBuffer(obj.Body)) Body = obj.Body;
        else if (typeof obj.Body === 'string') Body = Buffer.from(obj.Body);
        else if (typeof obj.Body.transformToString === 'function') {
          Body = Buffer.from(await obj.Body.transformToString(), 'utf8');
        }
      }
      ContentType = obj && obj.ContentType;
    } catch {
      // marker may be empty
    }
  }
  await opts.putObject({
    Key,
    Body,
    Metadata,
    ...(ContentType ? { ContentType } : {}),
  });
}

module.exports = {
  processFolderEvent,
  annotationNeed,
  hostAnnotationsKey,
  guidAnnotationsKey,
  guidSteeringKey,
  listGuidIds,
  defaultReviewHost,
  defaultReviewGuid,
};
