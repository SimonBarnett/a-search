'use strict';

/**
 * FR #3968: ensure a-clubs/{hostkey}/ marker with Madeira userid metadata.
 * FR #4287: userid only. The legacy duplicate metadata key is not written.
 * Sets lastmod on create; publishes folder event when newly created.
 */

const { normalizeHost } = require('../../shared/components/customers');
const {
  safeHostFolderName,
  buildHostTagSet,
  parseHostTagSet,
  isoLastmod,
} = require('../../shared/widgets/hostFolderMeta');
const {
  mintUniqueUserId,
  isChecksumValid,
} = require('../../shared/identity/madeiraUserId');
const { hostMarkerKey, useridClaimKey } = require('./aClubsKeys');
const { headOrNull, putIfAbsent, isPreconditionFailed } = require('./s3Store');
const { publishFolderEvent } = require('./publishFolderEvent');
const { isEmbedFrameHost } = require('./embedHostPatterns');
const { metaUserid } = require('./migrateHostUserid');

/**
 * @param {{
 *   host: string,
 *   headObject: Function,
 *   putObject: Function,
 *   putObjectTagging?: Function,
 *   mint?: () => string,
 *   sendMessage?: Function,
 *   folderEventsQueueUrl?: string,
 *   now?: Date|string|number,
 * }} opts
 * @returns {Promise<{
 *   created: boolean,
 *   hostkey: string,
 *   userid: string,
 *   metadata: Record<string, string>,
 *   tags: object,
 * }>}
 */
async function ensureAclubsHost(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('ensureAclubsHost opts required');
  }
  if (typeof opts.headObject !== 'function' || typeof opts.putObject !== 'function') {
    throw new Error('s3_client_required');
  }

  const host = normalizeHost(opts.host);
  // FR #4107: never create an embed-frame host folder (defense in depth).
  if (isEmbedFrameHost(host) || isEmbedFrameHost(safeHostFolderName(host))) {
    const err = new Error('club_domain_unresolved');
    err.code = 'club_domain_unresolved';
    throw err;
  }
  const hostkey = safeHostFolderName(host);
  const markerKey = hostMarkerKey(host);

  const existing = await headOrNull({
    headObject: opts.headObject,
    Key: markerKey,
  });
  if (existing) {
    const md = existing.Metadata || existing.metadata || {};
    const userid = metaUserid(md);
    return {
      created: false,
      hostkey,
      userid,
      metadata: {
        userid,
        host: md.host || host,
        hostkey: md.hostkey || hostkey,
        email: md.email == null ? '' : String(md.email),
        passwordhash: md.passwordhash == null ? '' : String(md.passwordhash),
        stripeaccountid:
          md.stripeaccountid == null ? '' : String(md.stripeaccountid),
        stripecustomerid:
          md.stripecustomerid == null ? '' : String(md.stripecustomerid),
        ...(md.lastmod ? { lastmod: String(md.lastmod) } : {}),
        ...(md.annotated != null ? { annotated: String(md.annotated) } : {}),
      },
      tags: { hasdns: false, partnerid: '', hasupg: false },
    };
  }

  const userid = await mintUniqueUserId({
    mint: opts.mint,
    maxAttempts: 25,
    claim: async (id) => {
      const claimKey = useridClaimKey(id);
      const r = await putIfAbsent({
        putObject: opts.putObject,
        Key: claimKey,
        Body: Buffer.from(hostkey, 'utf8'),
        ContentType: 'text/plain; charset=utf-8',
      });
      return r.created;
    },
  });

  if (!isChecksumValid(userid)) {
    const err = new Error('mint_bad_checksum');
    err.code = 'mint_bad_checksum';
    throw err;
  }

  const createdAtForMeta = isoLastmod(opts.now);
  const metadata = {
    userid,
    host,
    hostkey,
    lastmod: createdAtForMeta,
    annotated: '0',
    // Claim/onboarding fills these later (setHostCredentials / setHostStripe).
    email: '',
    passwordhash: '',
    stripeaccountid: '',
    stripecustomerid: '',
  };
  const tagSet = buildHostTagSet({ hasdns: 0, partnerid: '', hasupg: 0 });
  const tagging = tagSet
    .map((t) => `${t.Key}=${encodeURIComponent(t.Value)}`)
    .join('&');

  let created = true;
  try {
    const put = await putIfAbsent({
      putObject: opts.putObject,
      Key: markerKey,
      Body: Buffer.alloc(0),
      Metadata: metadata,
      Tagging: tagging,
    });
    created = put.created;
  } catch (err) {
    if (!isPreconditionFailed(err)) throw err;
    created = false;
  }

  if (!created) {
    const again = await headOrNull({
      headObject: opts.headObject,
      Key: markerKey,
    });
    const md = (again && (again.Metadata || again.metadata)) || metadata;
    const uid = metaUserid(md) || userid;
    return {
      created: false,
      hostkey,
      userid: uid,
      metadata: {
        userid: uid,
        host: md.host || host,
        hostkey: md.hostkey || hostkey,
        email: md.email == null ? '' : String(md.email),
        passwordhash: md.passwordhash == null ? '' : String(md.passwordhash),
        stripeaccountid:
          md.stripeaccountid == null ? '' : String(md.stripeaccountid),
        stripecustomerid:
          md.stripecustomerid == null ? '' : String(md.stripecustomerid),
        ...(md.lastmod ? { lastmod: String(md.lastmod) } : {}),
      },
      tags: parseHostTagSet(tagSet),
    };
  }

  if (typeof opts.putObjectTagging === 'function') {
    await opts.putObjectTagging({
      Key: markerKey,
      Tagging: { TagSet: tagSet },
    });
  }

  if (typeof opts.sendMessage === 'function' && opts.folderEventsQueueUrl) {
    await publishFolderEvent({
      sendMessage: opts.sendMessage,
      queueUrl: opts.folderEventsQueueUrl,
      hostkey,
      host,
      createdAt: metadata.lastmod,
      reason: 'host',
    });
  }

  return {
    created: true,
    hostkey,
    userid,
    metadata,
    tags: parseHostTagSet(tagSet),
  };
}

module.exports = {
  ensureAclubsHost,
};
