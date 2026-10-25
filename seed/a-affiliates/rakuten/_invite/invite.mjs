/**
 * Seed copy. Live mount should point here or at repo redqueen/invite/rakuten-invite.mjs.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repo = process.env.A_SEARCH_ROOT || 'C:\\ai\\a-search';
const entry = path.join(repo, 'redqueen', 'invite', 'rakuten-invite.mjs');
await import(pathToFileURL(entry).href);
