'use strict';

/**
 * FR #4147: fetch club/GUID pages for redqueen reviewers.
 * Follows redirects; timeout + size cap; strips HTML to readable text.
 * Never logs response bodies that might contain secrets beyond public HTML.
 */

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_BYTES = 512 * 1024;

/**
 * @param {string} html
 * @returns {string}
 */
function extractReadableText(html) {
  let s = String(html || '');
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * @param {{
 *   url: string,
 *   fetchImpl?: Function,
 *   timeoutMs?: number,
 *   maxBytes?: number,
 *   userAgent?: string,
 * }} opts
 * @returns {Promise<{ ok: true, text: string, bytes: number, truncated: boolean } | { ok: false, detail: string }>}
 */
async function fetchPageText(opts) {
  const url = String((opts && opts.url) || '').trim();
  if (!url) return { ok: false, detail: 'url_required' };
  const fetchFn =
    (opts && opts.fetchImpl) ||
    (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  if (typeof fetchFn !== 'function') {
    return { ok: false, detail: 'fetch_unavailable' };
  }
  const timeoutMs =
    opts && opts.timeoutMs != null ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const maxBytes =
    opts && opts.maxBytes != null ? Number(opts.maxBytes) : DEFAULT_MAX_BYTES;
  const userAgent =
    (opts && opts.userAgent) ||
    process.env.A_SEARCH_REDQUEEN_UA ||
    'a-search-redqueen-annotator/1.0';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': userAgent, accept: 'text/html,text/plain,*/*' },
    });
    if (!res || res.ok !== true) {
      const status = res && res.status != null ? res.status : 'unknown';
      return { ok: false, detail: `http_${status}` };
    }
    let buf;
    if (typeof res.arrayBuffer === 'function') {
      buf = Buffer.from(await res.arrayBuffer());
    } else if (Buffer.isBuffer(res.body)) {
      buf = res.body;
    } else {
      buf = Buffer.from(String(res.body || ''), 'utf8');
    }
    if (!buf.length) return { ok: false, detail: 'empty_body' };
    const truncated = buf.length > maxBytes;
    const sliced = truncated ? buf.subarray(0, maxBytes) : buf;
    const text = extractReadableText(sliced.toString('utf8'));
    if (!text) return { ok: false, detail: 'empty_text' };
    return { ok: true, text, bytes: buf.length, truncated: Boolean(truncated) };
  } catch (err) {
    const name = err && err.name;
    if (name === 'AbortError') return { ok: false, detail: 'timeout' };
    const msg = (err && err.message) || String(err);
    // DNS / network
    if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|getaddrinfo/i.test(msg)) {
      return { ok: false, detail: `dns_or_network:${msg.slice(0, 120)}` };
    }
    return { ok: false, detail: `fetch_error:${msg.slice(0, 160)}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build https URL for host home or GUID page.
 * @param {string} host
 * @param {string} [uri]
 */
function clubPageUrl(host, uri) {
  const h = String(host || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .split('/')[0];
  if (!h) return '';
  if (uri == null || String(uri).trim() === '' || String(uri).trim() === '/') {
    return `https://${h}/`;
  }
  let path = String(uri).trim();
  if (!path.startsWith('/')) path = `/${path}`;
  return `https://${h}${path}`;
}

module.exports = {
  fetchPageText,
  extractReadableText,
  clubPageUrl,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_BYTES,
};
