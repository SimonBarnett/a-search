'use strict';

/**
 * FR #3968: ensure a-clubs/{hostkey}/ marker with Madeira userid metadata.
 * customerNumber metadata === userid (documented choice; no sequential counter).
 */

const { normalizeHost } = require('../../shared/components/customers');
const {
  safeHostFolderName,
  buildHostTagSet,
  parseHostTagSet,
} = require('../../shared/widgets/hostFolderMeta');
const {
  mintUniqueUserId,
  isChecksumValid,
} = require('../../shared/identity/madeiraUserId');
const { hostMarkerKey, useridClaimKey } = require('./aClubsKeys');
const { headOrNull, putIfAbsent, isPreconditionFailed } = require('./s3Store');

/**
 * @param {{
 *   host: string,
 *   headObject: Function,
 *   putObject: Function,
 *   putObjectTagging?: Function,
 *   mint?: () => string,
 * }} opts
 * @returns {Promise<{
 *   created: boolean,
 *   hostkey: string,
 *   userid: string,
 *   customerNumber: string,
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
  const hostkey = safeHostFolderName(host);
  const markerKey = hostMarkerKey(host);

  const existing = await headOrNull({
    headObject: opts.headObject,
    Key: markerKey,
  });
  if (existing) {
    const md = existing.Metadata || existing.metadata || {};
    const userid = String(md.userid || md.userId || '').trim().toUpperCase();
    const customerNumber = String(
      md.customerNumber || md.customernumber || userid,
    ).trim();
    return {
      created: false,
      hostkey,
      userid,
      customerNumber: customerNumber || userid,
      metadata: {
        userid,
        host,
        hostkey,
        customerNumber: customerNumber || userid,
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

  // customerNumber === userid (FR #3968: no sequential in-memory counter)
  const metadata = {
    userid,
    host,
    hostkey,
    customerNumber: userid,
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
    const uid = String(md.userid || userid).trim().toUpperCase();
    return {
      created: false,
      hostkey,
      userid: uid,
      customerNumber: String(md.customerNumber || uid),
      metadata: {
        userid: uid,
        host: md.host || host,
        hostkey: md.hostkey || hostkey,
        customerNumber: String(md.customerNumber || uid),
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

  return {
    created: true,
    hostkey,
    userid,
    customerNumber: userid,
    metadata,
    tags: parseHostTagSet(tagSet),
  };
}

module.exports = {
  ensureAclubsHost,
};
