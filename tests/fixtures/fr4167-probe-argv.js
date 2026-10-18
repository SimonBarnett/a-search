'use strict';
const fs = require('fs');
const out = process.argv.slice(2).join('\0');
fs.writeFileSync(process.env.FR4167_ARGV_OUT, out, 'utf8');
process.exit(0);
