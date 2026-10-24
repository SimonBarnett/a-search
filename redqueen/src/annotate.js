'use strict';

/**
 * FR #4098 / #3987: redqueen annotation agent --- host review first, then GUID pages.
 * Writes S3 object annotations (annotation / steering) on folder markers --- never
 * annotations.json or steering.json. GUID marker is zero-byte `{hostkey}/{guid}/`.
 * Stub / unavailable reviewers never set annotated=1.
 */

const { parseFolderEvent } = require('../../shared/aClubs/folderEvents');
const {
  isUsableReview,
  defaultReviewHost,
  defaultReviewGuid,
  annotationsTooSimilar,
  hostBriefText,
  isCompleteHostBrief,
  isCompleteGuidReview,
} = require('./reviewers');
const {
  HOST_SCHEMA,
  PAGE_SCHEMA,
  validateHostAnnotation,
  validatePageAnnotation,
  liftHostReview,
  liftPageReview,
  hasCurrentHostSchema,
  hasCurrentPageSchema,
  steeringFromPage,
} = require('./annotationSchemas');
const { pageOverlapsHost } = require('./pageOverlap');
const { fetchPageText, clubPageUrl } = require('./fetchPage');
const { publishGuidSearch, localPostSearchAck, guidSearchState } = require('./guidSearch');

/** @deprecated FR #4098 --- sidecars removed; kept for test migration grep */
function hostAnnotationsKey(hostkey) {
  return `${String(hostkey).replace(/\/+$/, '')}/annotations.json`;
}

/** @deprecated */
function guidAnnotationsKey(hostkey, guid) {
  return `${String(hostkey).replace(/\/+$/, '')}/${guid}/annotations.json`;
}

/** @deprecated */
function guidSteeringKey(hostkey, guid) {
  return `${String(hostkey).replace(/\/+$/, '')}/${guid}/steering.json`;
}

function hostMarkerKeyFromHostkey(hostkey) {
  return `${String(hostkey).replace(/\/+$/, '')}/`;
}

function guidMarkerKeyFromHostkey(hostkey, guid) {
  return `${String(hostkey).replace(/\/+$/, '')}/${String(guid).toLowerCase()}/`;
}

/**
 * annotated flag + lastmod vs lastupdate:
 * - no annotated=1 -> needs create
 * - annotated=1 and lastmod > lastupdate -> needs update
 * - annotated=1 and lastmod <= lastupdate -> skip
 * @param {Record<string, string>} md
 * @returns {'create'|'update'|'skip'}
 */
function annotationNeed(md, flags) {
  const meta = md || {};
  if (String(meta.annotated || '') !== '1') return 'create';
  if (flags && flags.reannotate) return 'update';
  const stored = flags && flags.stored;
  if (flags && flags.expectSchema) {
    if (!stored || stored.schema !== flags.expectSchema) return 'update';
  }
  const lastmod = String(meta.lastmod || '').trim();
  const lastupdate = String(meta.lastupdate || '').trim();
  if (!lastupdate) return 'update';
  if (lastmod && lastmod > lastupdate) return 'update';
  return 'skip';
}

/**
 * FR #4827: a real edit bumped lastmod after the last annotation.
 * Missing lastupdate is not enough — FR #4311 reposts those without a new review.
 * REDQUEEN_REANNOTATE stays a search repost, not a second reviewer call.
 * @param {Record<string, string>|undefined} md
 * @returns {boolean}
 */
function markerContentStale(md) {
  const meta = md || {};
  const lastmod = String(meta.lastmod || '').trim();
  const lastupdate = String(meta.lastupdate || '').trim();
  return !!(lastmod && lastupdate && lastmod > lastupdate);
}

/**
 * @param {object} opts
 * @param {string} Key
 * @param {string} name
 * @param {string|object} payload
 */
async function putNamedAnnotation(opts, Key, name, payload) {
  if (typeof opts.putObjectAnnotation !== 'function') {
    throw new Error('putObjectAnnotation_required');
  }
  const text =
    typeof payload === 'string' ? payload : `${JSON.stringify(payload, null, 2)}\n`;
  await opts.putObjectAnnotation({
    Key,
    AnnotationName: name,
    AnnotationPayload: text,
  });
}

/**
 * @param {object} opts
 * @param {string} Key
 * @param {string} name
 */
async function getNamedAnnotationJson(opts, Key, name) {
  if (typeof opts.getObjectAnnotation !== 'function') return null;
  try {
    const resp = await opts.getObjectAnnotation({ Key, AnnotationName: name });
    let text = '';
    const body = resp && (resp.AnnotationPayload != null ? resp.AnnotationPayload : resp.Body);
    if (Buffer.isBuffer(body)) text = body.toString('utf8');
    else if (typeof body === 'string') text = body;
    else if (body && typeof body.transformToString === 'function') {
      text = await body.transformToString();
    } else if (body != null) text = String(body);
    return JSON.parse(text);
  } catch (err) {
    const status = err && err.$metadata && err.$metadata.httpStatusCode;
    const code = err && (err.name || err.code);
    if (
      status === 404 ||
      code === 'NotFound' ||
      code === 'NoSuchKey' ||
      code === 'NoSuchAnnotation'
    ) {
      return null;
    }
    if (err instanceof SyntaxError) return null;
    throw err;
  }
}

/**
 * After metadata rewrite, ensure named annotations still exist; re-apply if missing.
 * @param {object} opts
 * @param {string} Key
 * @param {Array<{ name: string, payload: object|string }>} wanted
 */
async function ensureAnnotationsSurvived(opts, Key, wanted) {
  for (const w of wanted) {
    let present = false;
    if (typeof opts.listObjectAnnotations === 'function') {
      try {
        const listed = await opts.listObjectAnnotations({ Key });
        const names = ((listed && listed.Annotations) || []).map(
          (a) => a && a.AnnotationName,
        );
        present = names.includes(w.name);
      } catch {
        present = false;
      }
    }
    if (!present) {
      await putNamedAnnotation(opts, Key, w.name, w.payload);
    }
  }
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
 *   putObjectAnnotation: Function,
 *   getObjectAnnotation?: Function,
 *   listObjectAnnotations?: Function,
 *   reviewHost?: Function,
 *   reviewGuid?: Function,
 *   now?: () => Date,
 *   onNewFolder?: Function,
 * }} opts
 */
async function processFolderEvent(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('processFolderEvent opts required');
  }
  if (typeof opts.headObject !== 'function' || typeof opts.putObject !== 'function') {
    throw new Error('s3_client_required');
  }
  if (typeof opts.putObjectAnnotation !== 'function') {
    throw new Error('putObjectAnnotation_required');
  }
  const event = opts.event
    ? parseFolderEvent(opts.event)
    : parseFolderEvent(opts.body);
  const now = (opts.now || (() => new Date()))().toISOString();
  const reviewHost = opts.reviewHost || defaultReviewHost;
  const reviewGuid = opts.reviewGuid || defaultReviewGuid;

  const markerKey = hostMarkerKeyFromHostkey(event.hostkey);
  const head = await headOrNull(opts, markerKey);
  if (!head) {
    return { action: 'retry', detail: 'host_marker_missing' };
  }
  const hostMd = (head.Metadata || head.metadata) || {};
  // FR #4311: every GUID already annotated with queries and at least one
  // missing searchid. POST those files; do not re-review the host.
  const guidsEarly = await listGuidIds(opts, event.hostkey);
  let searchRepostOnly = guidsEarly.length > 0;
  let anyRepost = false;
  for (const guid of guidsEarly) {
    const gHead = await headOrNull(opts, guidMarkerKeyFromHostkey(event.hostkey, guid));
    const gMd = (gHead && (gHead.Metadata || gHead.metadata)) || {};
    if (String(gMd.annotated || '') !== '1') {
      searchRepostOnly = false;
      break;
    }
    const state = await guidSearchState(opts, event.hostkey, guid);
    if (state === 'missing') {
      searchRepostOnly = false;
      break;
    }
    if (state === 'repost') anyRepost = true;
  }
  let storedHostAnn = await getNamedAnnotationJson(opts, markerKey, 'annotation');
  // FR #4827: a host whose lastmod is newer than lastupdate is reviewed even
  // when GUIDs only need a search repost. A fresh host stays on the repost path
  // (FR #4311), including REDQUEEN_REANNOTATE.
  const hostAnnNeed = annotationNeed(hostMd, {
    reannotate: Boolean(opts.reannotate),
    stored: storedHostAnn,
    expectSchema: HOST_SCHEMA,
  });
  const hostNeed = searchRepostOnly && !markerContentStale(hostMd) ? 'skip' : hostAnnNeed;

  let hostAnnDoc = null;
  let hostLegacy = null;

  if (hostNeed !== 'skip') {
    const hostUrl = clubPageUrl(event.host);
    const hostPage = await fetchPageText({
      url: hostUrl,
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.fetchTimeoutMs,
      maxBytes: opts.fetchMaxBytes,
    });
    if (!hostPage.ok) {
      return {
        action: 'retry',
        detail: `host_fetch_failed:${hostPage.detail || 'unknown'}`,
      };
    }
    const extraPages = [];
    for (const extraUrl of hostPage.contextLinks || []) {
      const extra = await fetchPageText({
        url: extraUrl,
        fetchImpl: opts.fetchImpl,
        timeoutMs: opts.fetchTimeoutMs,
        maxBytes: opts.fetchMaxBytes,
      });
      if (!extra.ok) continue;
      extraPages.push({
        url: extraUrl,
        title: extra.head && extra.head.title,
        text: String(extra.text || '').slice(0, 4000),
      });
    }
    const hostInput = {
      host: event.host,
      hostkey: event.hostkey,
      pageText: hostPage.text,
      pageHead: hostPage.head,
      pageUrl: hostUrl,
      extraPages,
    };
    let review;
    try {
      review = await reviewHost(hostInput);
    } catch (err) {
      const detail = (err && err.message) || 'host_review_failed';
      return { action: 'retry', detail: `host_review_failed:${detail}` };
    }
    if (!isUsableReview(review) || !isCompleteHostBrief(review)) {
      try {
        review = await reviewHost({
          ...hostInput,
          validatorErrors: (review && review.errors) || ['host_brief_incomplete'],
        });
      } catch {
        /* keep first */
      }
    }
    if (!isUsableReview(review) || !isCompleteHostBrief(review)) {
      return {
        action: 'retry',
        detail: !isUsableReview(review)
          ? (review && review.schema_invalid
            ? 'host_schema_invalid'
            : `host_reviewer_unavailable:${(review && review.detail) || 'stub'}`)
          : 'host_brief_incomplete',
      };
    }
    hostAnnDoc = liftHostReview(review, {
      host: event.host,
      reviewedAt: now,
      model: review.model,
    });
    const hostOk = validateHostAnnotation(hostAnnDoc);
    if (!hostOk.ok) {
      return { action: 'retry', detail: 'host_schema_invalid' };
    }
    hostLegacy = {
      summary: review.summary || '',
      club: review.club || '',
      audience: review.audience,
      affiliateOpportunities: review.affiliateOpportunities || '',
    };
    await putNamedAnnotation(opts, markerKey, 'annotation', hostAnnDoc);
    await putMarkerMetadata(opts, markerKey, hostMd, {
      annotated: '1',
      lastupdate: now,
      lastmod: now,
    });
    await ensureAnnotationsSurvived(opts, markerKey, [
      { name: 'annotation', payload: hostAnnDoc },
    ]);
    if (typeof opts.onNewFolder === 'function') {
      await opts.onNewFolder({
        kind: 'host',
        hostkey: event.hostkey,
        host: event.host,
        key: markerKey,
      });
    }
  } else {
    hostAnnDoc = storedHostAnn;
    if (!hostAnnDoc) {
      return { action: 'retry', detail: 'host_annotations_missing' };
    }
    if (!hasCurrentHostSchema(hostAnnDoc) && !searchRepostOnly) {
      return { action: 'retry', detail: 'host_schema_invalid' };
    }
  }

  const guids = guidsEarly;
  const guidResults = [];
  for (const guid of guids) {
    const result = await annotateOneGuid({
      opts,
      event,
      guid,
      hostAnn: hostAnnDoc,
      hostLegacy,
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

async function annotateOneGuid(args) {
  const { opts, event, guid, hostAnn, hostLegacy, reviewGuid, now } = args;
  const markerKey = guidMarkerKeyFromHostkey(event.hostkey, guid);
  const markerHead = await headOrNull(opts, markerKey);
  if (!markerHead) {
    return { action: 'skip', detail: 'guid_marker_missing' };
  }
  const guidMd = (markerHead.Metadata || markerHead.metadata) || {};
  if (String(guidMd.annotated || '') === '1' && !markerContentStale(guidMd)) {
    // Fresh marker: repost /search (missing searchid or hash mismatch).
    // lastmod > lastupdate falls through and re-reviews the page.
    try {
      const published = await publishGuidSearch({
        ...opts,
        hostkey: event.hostkey,
        guid,
        metadata: guidMd,
        now,
        repostExisting: true,
        postSearch: opts.postSearch || localPostSearchAck(),
      });
      if (published.reposted) {
        return { action: 'guid_searched', detail: 'search_reposted' };
      }
      if (published.idempotent && !published.wrote) {
        return { action: 'noop', detail: 'guid_unchanged' };
      }
    } catch (err) {
      if (!(err && err.code === 'searches_missing')) {
        return {
          action: 'retry',
          detail: (err && err.code) || 'search_failed',
        };
      }
    }
  }
  const storedGuidAnn = await getNamedAnnotationJson(opts, markerKey, 'annotation');
  const need = annotationNeed(guidMd, {
    reannotate: Boolean(opts.reannotate),
    stored: storedGuidAnn,
    expectSchema: PAGE_SCHEMA,
  });
  if (need === 'skip') {
    const ann = await getNamedAnnotationJson(opts, markerKey, 'annotation');
    if (!ann) return { action: 'noop', detail: 'guid_unchanged' };
    const steering = await getNamedAnnotationJson(opts, markerKey, 'steering');
    try {
      const published = await publishGuidSearch({
        ...opts,
        hostkey: event.hostkey,
        guid,
        review: ann,
        steering: steering || undefined,
        page: hasCurrentPageSchema(ann) ? ann : undefined,
        host: hasCurrentHostSchema(hostAnn) ? hostAnn : undefined,
        metadata: guidMd,
        now,
        postSearch: opts.postSearch || localPostSearchAck(),
      });
      if (!published.wrote) return { action: 'noop', detail: 'guid_unchanged' };
      return { action: 'guid_searched', detail: 'search_completed' };
    } catch (err) {
      return {
        action: 'retry',
        detail: (err && err.code) || 'search_failed',
      };
    }
  }

  const uri = String(guidMd.uri || '').trim();
  const pageUrl = clubPageUrl(event.host, uri || '/');
  const guidPage = await fetchPageText({
    url: pageUrl,
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.fetchTimeoutMs,
    maxBytes: opts.fetchMaxBytes,
  });
  if (!guidPage.ok) {
    return {
      action: 'retry',
      detail: `guid_fetch_failed:${guidPage.detail || 'unknown'}`,
    };
  }

  if (!hasCurrentHostSchema(hostAnn) && !validateHostAnnotation(liftHostReview(hostAnn, { host: event.host })).ok) {
    return { action: 'retry', detail: 'host_schema_invalid' };
  }
  const hostDoc = hasCurrentHostSchema(hostAnn)
    ? hostAnn
    : liftHostReview(hostAnn, { host: event.host, reviewedAt: now, model: hostAnn.model });

  const guidInput = {
    host: event.host,
    hostkey: event.hostkey,
    guid,
    uri,
    hostAnnotations: {
      ...hostDoc,
      summary: (hostLegacy && hostLegacy.summary) || hostDoc.about || '',
      club: (hostLegacy && hostLegacy.club) || hostDoc.about || '',
      audience:
        (hostLegacy && typeof hostLegacy.audience === 'string' && hostLegacy.audience) ||
        (hostDoc.audience && hostDoc.audience.summary) ||
        '',
      affiliateOpportunities:
        (hostLegacy && hostLegacy.affiliateOpportunities) ||
        ((hostDoc.affiliate_opportunities || [])[0] &&
          hostDoc.affiliate_opportunities[0].category) ||
        '',
    },
    pageText: guidPage.text,
    pageHead: guidPage.head,
    pageUrl,
  };
  let review;
  try {
    review = await reviewGuid(guidInput);
  } catch (err) {
    return {
      action: 'retry',
      detail: `guid_review_failed:${(err && err.message) || err}`,
    };
  }
  if (!isUsableReview(review) || !isCompleteGuidReview(review)) {
    try {
      review = await reviewGuid({
        ...guidInput,
        validatorErrors: (review && review.errors) || ['page_schema_invalid'],
      });
    } catch {
      /* keep first */
    }
  }
  if (!isUsableReview(review) || !isCompleteGuidReview(review)) {
    return {
      action: 'retry',
      detail: !isUsableReview(review)
        ? (review && review.schema_invalid
          ? 'page_schema_invalid'
          : `guid_reviewer_unavailable:${(review && review.detail) || 'stub'}`)
        : 'page_schema_invalid',
    };
  }

  const pageDoc = liftPageReview(review, {
    guid,
    uri: uri || '/',
    annotatedAt: now,
    model: review.model,
    pageHead: guidPage.head,
  });
  const pageOk = validatePageAnnotation(pageDoc);
  if (!pageOk.ok) {
    return { action: 'retry', detail: 'page_schema_invalid' };
  }

  const siblings = [];
  const otherGuids = await listGuidIds(opts, event.hostkey);
  for (const other of otherGuids) {
    if (other === guid) continue;
    const otherAnn = await getNamedAnnotationJson(
      opts,
      guidMarkerKeyFromHostkey(event.hostkey, other),
      'annotation',
    );
    if (otherAnn && hasCurrentPageSchema(otherAnn)) {
      siblings.push({ uri: otherAnn.uri, page: otherAnn });
    }
  }
  const overlap = pageOverlapsHost(pageDoc, hostDoc, { siblings });
  pageDoc.selection.page_exclusions = overlap.page_exclusions;
  if (!overlap.ok) {
    return { action: 'retry', detail: 'page_repeats_host' };
  }
  if (
    review.summary &&
    annotationsTooSimilar(review.summary, hostBriefText(hostAnn) || hostDoc.about)
  ) {
    return { action: 'retry', detail: 'page_repeats_host' };
  }

  const steering = review.steering != null ? review.steering : steeringFromPage(pageDoc);
  const wanted = [{ name: 'annotation', payload: pageDoc }];
  await putNamedAnnotation(opts, markerKey, 'annotation', pageDoc);
  await putNamedAnnotation(opts, markerKey, 'steering', steering);
  wanted.push({ name: 'steering', payload: steering });

  await putMarkerMetadata(opts, markerKey, guidMd, {
    annotated: '1',
    lastupdate: now,
    lastmod: now,
    ...(uri ? { uri } : {}),
  });
  await ensureAnnotationsSurvived(opts, markerKey, wanted);

  if (typeof opts.onNewFolder === 'function') {
    await opts.onNewFolder({
      kind: 'guid',
      hostkey: event.hostkey,
      host: event.host,
      guid,
      key: markerKey,
      uri,
    });
  }

  try {
    await publishGuidSearch({
      ...opts,
      hostkey: event.hostkey,
      guid,
      review,
      steering,
      host: hostDoc,
      page: pageDoc,
      metadata: { ...guidMd, annotated: '1' },
      now,
      postSearch: opts.postSearch || localPostSearchAck(),
    });
  } catch (err) {
    return {
      action: 'retry',
      detail: (err && err.code) || 'search_failed',
    };
  }

  return { action: need === 'create' ? 'guid_annotated' : 'guid_updated' };
}

/**
 * Discover GUID folders under hostkey via listObjectsV2.
 * Looks for zero-byte `{hostkey}/{guid}/` marker keys (FR #3968 / #4098).
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
      const m = /^([0-9a-fA-F-]{36})\/$/.exec(rest);
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

/**
 * Rewrite object metadata via copyObject REPLACE when available; else get+put.
 * Re-applies annotations afterward via ensureAnnotationsSurvived (caller).
 */
async function putMarkerMetadata(opts, Key, prevMd, patch) {
  const Metadata = { ...(prevMd || {}), ...patch };
  for (const k of Object.keys(Metadata)) {
    Metadata[k] = String(Metadata[k]);
  }
  if (typeof opts.copyObject === 'function') {
    const bucket = opts.bucket || process.env.A_CLUBS_BUCKET || 'a-clubs';
    await opts.copyObject({
      Key,
      CopySource: `${bucket}/${Key}`,
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
  hostMarkerKeyFromHostkey,
  guidMarkerKeyFromHostkey,
  listGuidIds,
  defaultReviewHost,
  defaultReviewGuid,
  isUsableReview,
  putNamedAnnotation,
  getNamedAnnotationJson,
  ensureAnnotationsSurvived,
};
