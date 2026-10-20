'use strict';

/**
 * FR #4701: Merc's 10 hand applications (2026-10-20 18:37 BST = 17:37Z), all Pending.
 */

const MERC_APPLIED_AT = '2026-10-20T17:37:00Z';

/** @type {Array<{ name: string, mid?: string, slug: string }>} */
const MERC_MANUAL_APPLICATIONS = [
  { name: 'Etsy UK+IE', mid: '54054', slug: 'etsy-uk-ie' },
  { name: 'Dream Home Store', slug: 'dream-home-store' },
  { name: 'Choice Furniture', slug: 'choice-furniture' },
  { name: 'Westwing', slug: 'westwing' },
  { name: 'Bramblecrest', slug: 'bramblecrest' },
  { name: 'Christow', slug: 'christow' },
  { name: 'JD Sports', slug: 'jd-sports' },
  { name: 'Jellycat', slug: 'jellycat' },
  { name: 'Samsung', slug: 'samsung' },
  { name: 'Panasonic', slug: 'panasonic' },
];

/**
 * @param {{ name: string, mid?: string, slug: string }} row
 */
function mercRecord(row) {
  return {
    mid: row.mid || '',
    name: row.name,
    status: 'pending',
    appliedat: MERC_APPLIED_AT,
    firstappliedat: MERC_APPLIED_AT,
    applycount: '1',
    lastchecked: '',
    approvedat: '',
    source: 'merc-manual',
    message: '',
    slug: row.slug,
  };
}

module.exports = {
  MERC_APPLIED_AT,
  MERC_MANUAL_APPLICATIONS,
  mercRecord,
};
