'use strict';

/**
 * FR #4463: RFC 4180 CSV/TSV parser (quoted fields, embedded commas/newlines).
 */

/**
 * @param {string} text
 * @param {{ delimiter?: string, quote?: string }} [opts]
 * @returns {string[][]}
 */
function parseRfc4180(text, opts = {}) {
  const delimiter = opts.delimiter != null ? String(opts.delimiter) : ',';
  const quote = opts.quote != null ? String(opts.quote) : '"';
  const src = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === quote) {
        if (src[i + 1] === quote) {
          field += quote;
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === quote) {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0 || inQuotes) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * @param {string} text
 * @param {{ delimiter?: string, quote?: string, header?: boolean }} [opts]
 * @returns {{ headers: string[], records: Record<string, string>[] }}
 */
function parseDelimitedRecords(text, opts = {}) {
  const rows = parseRfc4180(text, opts);
  if (!rows.length) return { headers: [], records: [] };
  const header = opts.header !== false;
  if (!header) {
    return {
      headers: [],
      records: rows.map((cols) => {
        const o = {};
        cols.forEach((c, idx) => {
          o[String(idx)] = c;
        });
        return o;
      }),
    };
  }
  const headers = rows[0].map((h) => String(h || '').trim());
  const records = [];
  for (let r = 1; r < rows.length; r += 1) {
    const cols = rows[r];
    if (cols.every((c) => String(c || '').trim() === '')) continue;
    const obj = {};
    for (let c = 0; c < headers.length; c += 1) {
      obj[headers[c]] = cols[c] != null ? String(cols[c]) : '';
    }
    records.push(obj);
  }
  return { headers, records };
}

module.exports = { parseRfc4180, parseDelimitedRecords };
