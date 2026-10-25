/**
 * stderr /|\| spinner for invite waits (matches folder-tools FolderProgress).
 */

const SPIN = ['/', '|', '\\', '-'];

function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function clearLine() {
  process.stderr.write(`\r${' '.repeat(96)}\r`);
}

/**
 * Sleep while showing Label + /|\| on stderr. Resolves when ms elapsed.
 * @param {number} ms
 * @param {string} label
 */
export function sleepWithSpinner(ms, label) {
  const duration = Math.max(0, Number(ms) || 0);
  if (duration <= 0) return Promise.resolve();
  if (duration < 400) {
    return new Promise((r) => setTimeout(r, duration));
  }

  return new Promise((resolve) => {
    const start = Date.now();
    let i = 0;
    process.stderr.write(`[${ts()}] ${label} ${SPIN[0]}  `);
    const tick = setInterval(() => {
      const ch = SPIN[i % 4];
      i += 1;
      process.stderr.write(`\r[${ts()}] ${label} ${ch}  `);
      if (Date.now() - start >= duration) {
        clearInterval(tick);
        clearLine();
        process.stderr.write(`[${ts()}] ${label} - done\n`);
        resolve();
      }
    }, 120);
  });
}

/**
 * Run an async fn while spinning. Use for waits that are not plain sleep
 * (e.g. waitForURL with timeout).
 * @param {string} label
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withSpinner(label, fn) {
  let i = 0;
  let stopped = false;
  process.stderr.write(`[${ts()}] ${label} ${SPIN[0]}  `);
  const tick = setInterval(() => {
    if (stopped) return;
    const ch = SPIN[i % 4];
    i += 1;
    process.stderr.write(`\r[${ts()}] ${label} ${ch}  `);
  }, 120);
  try {
    const result = await fn();
    stopped = true;
    clearInterval(tick);
    clearLine();
    process.stderr.write(`[${ts()}] ${label} - done\n`);
    return result;
  } catch (e) {
    stopped = true;
    clearInterval(tick);
    clearLine();
    process.stderr.write(`[${ts()}] ${label} - failed\n`);
    throw e;
  }
}
