'use strict';

/**
 * CLI: parse Awin parts CSV or coupons JSON to a JSON array file.
 *   node parse-cli.js --parts in.csv --out parts.json
 *   node parse-cli.js --coupons in.coupons.json --out offers.json
 */

const fs = require('node:fs');
const { parseAwinPartsCsv, parseAwinCouponsJson } = require('./parseAwin');

function argVal(argv, name) {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  return argv[i + 1] || null;
}

function main(argv) {
  const partsIn = argVal(argv, '--parts');
  const couponsIn = argVal(argv, '--coupons');
  const out = argVal(argv, '--out');
  if (!out || (!partsIn && !couponsIn)) {
    process.stderr.write('usage: parse-cli.js --parts file.csv|--coupons file.json --out out.json\n');
    process.exit(2);
  }
  let rows;
  if (partsIn) {
    rows = parseAwinPartsCsv(fs.readFileSync(partsIn));
  } else {
    rows = parseAwinCouponsJson(fs.readFileSync(couponsIn));
  }
  // NDJSON for Windows PowerShell 5.1 (ConvertFrom-Json on large arrays is unreliable).
  const ndjson = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
  fs.writeFileSync(out, ndjson);
  process.stdout.write(JSON.stringify({ ok: true, count: rows.length, out }) + '\n');
}

main(process.argv.slice(2));
