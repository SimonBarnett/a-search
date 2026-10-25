/**
 * Compatibility alias — use invite.mjs (deterministic scheduled inviter).
 *   node live-join.mjs --live --max=3
 * Forwards argv to invite.mjs in the same directory.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(dir, 'invite.mjs');
const child = spawn(process.execPath, [target, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
