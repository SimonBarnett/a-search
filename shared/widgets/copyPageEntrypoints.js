'use strict';

/**
 * FR-219 / FR-220: copy-page entrypoints for both public sites.
 * One shared POST /widgets mint + snippet template (FR-232 rule 4).
 */

/** @type {{ site: string, createdVia: string, repoPath: string }[]} */
const COPY_PAGE_ENTRYPOINTS = [
  {
    site: 'smartcatalogue.uk',
    createdVia: 'smartcatalogue',
    repoPath: 'components-piece/widget-copy/index.html',
  },
  {
    site: 'clubmadeira.uk',
    createdVia: 'clubmadeira',
    repoPath: 'components-piece/widget-copy-clubmadeira/index.html',
  },
];

module.exports = { COPY_PAGE_ENTRYPOINTS };
