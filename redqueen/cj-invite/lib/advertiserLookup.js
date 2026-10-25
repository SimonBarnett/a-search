'use strict';

/**
 * FR #5066: CJ Advertiser Lookup API client (XML).
 * GET https://advertiser-lookup.api.cj.com/v2/advertiser-lookup
 * Publishers only; 25 calls/minute; max 100 records per page.
 */

export const LOOKUP_BASE =
  'https://advertiser-lookup.api.cj.com/v2/advertiser-lookup';
export const MAX_RECORDS_PER_PAGE = 100;
/** Floor between calls so we stay under 25/min (60/25 = 2.4s). */
export const MIN_INTERVAL_MS = 2500;

export class CjAccountNotActiveError extends Error {
  constructor(message) {
    super(message || 'cj_account_not_active');
    this.name = 'CjAccountNotActiveError';
    this.code = 'cj_account_not_active';
    this.status = 403;
  }
}

/**
 * @param {string} xml
 * @returns {object[]}
 */
export function parseAdvertiserLookupXml(xml) {
  const text = String(xml || '');
  /** @type {object[]} */
  const out = [];
  // Split on <advertiser> blocks (CJ v2 XML). Tolerate attribute or nested forms.
  const blocks = text.split(/<\/?advertisers?>/i);
  const advRe =
    /<advertiser\b[^>]*>([\s\S]*?)<\/advertiser>|<advertiser\b([^>]*)\/>/gi;
  let m;
  const body = text;
  while ((m = advRe.exec(body)) !== null) {
    const chunk = m[1] != null ? m[1] : m[2] || '';
    const full = m[0];
    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
      const hit = r.exec(chunk) || r.exec(full);
      return hit ? String(hit[1]).trim() : '';
    };
    const attr = (name) => {
      const r = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i');
      const hit = r.exec(full);
      return hit ? String(hit[1]).trim() : '';
    };
    const id =
      get('advertiser-id') ||
      get('advertiser-cid') ||
      attr('advertiser-id') ||
      attr('id');
    if (!id) continue;
    const name =
      get('advertiser-name') || get('name') || attr('advertiser-name') || '';
    const relationship =
      get('relationship-status') ||
      get('relationship') ||
      attr('relationship-status') ||
      '';
    const accountStatus = get('account-status') || attr('account-status') || '';
    const networkRankRaw =
      get('network-rank') || attr('network-rank') || get('rank') || '';
    const epc7 = get('seven-day-epc') || get('seven_day_epc') || '';
    const epc3m = get('three-month-epc') || get('three_month_epc') || '';
    const category =
      get('primary-category') ||
      get('primary_category') ||
      get('category') ||
      '';
    out.push({
      id: String(id).trim(),
      name,
      relationshipStatus: relationship.toLowerCase(),
      accountStatus: accountStatus.toLowerCase(),
      networkRank: networkRankRaw ? Number(networkRankRaw) : null,
      epc7Day: epc7 ? Number(epc7) : null,
      epc3Month: epc3m ? Number(epc3m) : null,
      primaryCategory: category,
      hasFeed: /product.?feed|deep.?link|advertiser.?link/i.test(full),
    });
  }
  return out;
}

/**
 * @param {URLSearchParams|Record<string,string>} params
 * @param {string} token
 * @param {{ fetchFn?: typeof fetch, now?: () => number }} [opts]
 */
export async function fetchAdvertiserLookupPage(params, token, opts = {}) {
  const fetchFn = opts.fetchFn || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch_unavailable');
  }
  const tok = String(token || '').trim();
  if (!tok) throw new Error('cj_token_required');

  const qs =
    params instanceof URLSearchParams
      ? params
      : new URLSearchParams(params || {});
  if (!qs.get('records-per-page')) {
    qs.set('records-per-page', String(MAX_RECORDS_PER_PAGE));
  }
  const url = `${LOOKUP_BASE}?${qs.toString()}`;
  const res = await fetchFn(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${tok}`,
      Accept: 'application/xml',
    },
  });
  if (res.status === 403) {
    throw new CjAccountNotActiveError(
      'cj_account_not_active: Advertiser Lookup returned 403 You are not Authorised',
    );
  }
  if (!res.ok) {
    const err = new Error(`cj_lookup_http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  const xml = await res.text();
  return parseAdvertiserLookupXml(xml);
}

/**
 * Page through notjoined (or joined) advertisers with 25/min pacing.
 * @param {{
 *   token: string,
 *   requestorCid: string,
 *   status?: 'notjoined'|'joined',
 *   maxPages?: number,
 *   fetchFn?: typeof fetch,
 *   sleepFn?: (ms: number) => Promise<void>,
 *   keywords?: string,
 * }} opts
 */
export async function listAdvertisers(opts) {
  const status = opts.status || 'notjoined';
  const maxPages = Math.max(1, Number(opts.maxPages) || 50);
  const sleepFn =
    opts.sleepFn ||
    ((ms) => new Promise((r) => setTimeout(r, ms)));
  /** @type {object[]} */
  const all = [];
  let lastCall = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const elapsed = Date.now() - lastCall;
    if (lastCall && elapsed < MIN_INTERVAL_MS) {
      await sleepFn(MIN_INTERVAL_MS - elapsed);
    }
    lastCall = Date.now();
    const params = {
      'requestor-cid': String(opts.requestorCid),
      'advertiser-ids': status,
      'page-number': String(page),
      'records-per-page': String(MAX_RECORDS_PER_PAGE),
    };
    if (opts.keywords) params.keywords = String(opts.keywords);
    const rows = await fetchAdvertiserLookupPage(params, opts.token, {
      fetchFn: opts.fetchFn,
    });
    for (const row of rows) all.push(row);
    if (rows.length < MAX_RECORDS_PER_PAGE) break;
  }
  return all;
}

/**
 * Filter to relationship notjoined (or joined).
 * @param {object[]} rows
 * @param {'notjoined'|'joined'} status
 */
export function filterByRelationship(rows, status) {
  const want = String(status || 'notjoined').toLowerCase();
  return (rows || []).filter((r) => {
    const rel = String(r.relationshipStatus || '').toLowerCase();
    if (!rel) return want === 'notjoined';
    if (want === 'joined') return rel === 'joined' || rel === 'joinedactive';
    return rel === 'notjoined' || rel === 'not_joined' || rel === 'none';
  });
}
