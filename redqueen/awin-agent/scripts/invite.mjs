/**
 * Deterministic Awin invite scheduler (Join Programmes / notJoined).
 * Zero LLM. Personalised messages from scraped fields. 90-day _invites gate.
 *
 *   node invite.mjs --max=3              # dry-run (fill modal, cancel; no S3 invite write)
 *   node invite.mjs --live --max=20
 *   $env:AWIN_OTP='......'; node invite.mjs --live --max=1
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  acquireLock,
  releaseLock,
  loadInviteIndex,
  classifySkip,
  rankCandidates,
  isJunkName,
  uniqueInviteMessage,
  writeInviteMarkerAws,
  asciiFold,
  DEFAULT_COOLDOWN_DAYS,
} from './lib/invite-core.mjs';
import { sleepWithSpinner, withSpinner } from './lib/spinner.mjs';

/** Short waits stay silent; longer waits get /|\| on stderr. */
async function pause(ms, label = 'Waiting') {
  const n = Math.max(0, Number(ms) || 0);
  if (n >= 800) return sleepWithSpinner(n, label);
  return new Promise((r) => setTimeout(r, n));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID || '2889699';
const SECRET_FILE = process.env.AWIN_SECRET_FILE || 'C:\\passwords\\awin.secret.txt';
const PROFILE = process.env.AWIN_PROFILE || 'C:\\ai\\a-search\\awin-agent\\profile';
const PROMO_URL = process.env.AWIN_PROMOTION_URL || 'https://www.clubmadeira.uk/for-awin-advertisers';
const AFFILIATES_ROOT = process.env.AWIN_AFFILIATES_ROOT || 'S:\\a-affiliates\\awin';
const LOG_DIR = process.env.AWIN_LOG_DIR || 'C:\\ai\\a-search\\awin-agent\\logs';
const REPORT_DIR = process.env.AWIN_INVITE_REPORT_DIR || 'C:\\ai\\a-search\\logs\\awin-invite';
const LOCK_PATH =
  process.env.AWIN_INVITE_LOCK ||
  path.join(process.env.ProgramData || 'C:\\ProgramData', 'a-search', 'awin-invite.lock');
const OTP = process.env.AWIN_OTP || '';
const COOLDOWN_DAYS = parseInt(process.env.AWIN_INVITE_COOLDOWN_DAYS || String(DEFAULT_COOLDOWN_DAYS), 10);
const ENV_MAX = parseInt(process.env.AWIN_MAX_JOINS || process.env.AWIN_AGENT_MAX_JOINS || '20', 10);

const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const HEADED = args.includes('--headed');
const maxArg = args.find((a) => a.startsWith('--max='));
const MAX = maxArg ? parseInt(maxArg.split('=')[1], 10) : ENV_MAX || 20;

function readSecrets() {
  const lines = fs.readFileSync(SECRET_FILE, 'utf8').split(/\r?\n/);
  if (lines.length < 2 || !lines[0] || !lines[1]) throw new Error('login file format');
  return { email: lines[0], password: lines[1] };
}

async function tickTrustThisMachine(page) {
  return page.evaluate(() => {
    const match = (s) =>
      /trust this (machine|device|computer)|remember (this )?device|remember me on this device|don'?t ask again/i.test(
        s || ''
      );
    const nodes = Array.from(document.querySelectorAll('label, span, div, p, li'));
    for (const node of nodes) {
      const text = (node.textContent || '').trim().replace(/\s+/g, ' ');
      if (!match(text) || text.length > 160) continue;
      const input =
        (node.matches('label') && node.querySelector('input[type="checkbox"]')) ||
        (node.htmlFor && document.getElementById(node.htmlFor)) ||
        node.querySelector('input[type="checkbox"]') ||
        node.previousElementSibling?.querySelector?.('input[type="checkbox"]') ||
        node.parentElement?.querySelector?.('input[type="checkbox"]');
      if (input && input.type === 'checkbox') {
        if (!input.checked) input.click();
        return { found: true, text, checked: !!input.checked };
      }
    }
    for (const input of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
      const blob = [input.name, input.id, input.value, input.getAttribute('aria-label'), input.parentElement?.textContent]
        .join(' ')
        .toLowerCase();
      if (/trust|remember|device|machine|computer/.test(blob)) {
        if (!input.checked) input.click();
        return { found: true, text: blob.slice(0, 120), checked: !!input.checked };
      }
    }
    return { found: false };
  });
}

async function readOtpPageError(page) {
  return page.evaluate(() => {
    const body = (document.body && document.body.innerText) || '';
    const m = body.match(/invalid code or expired|code (is )?invalid|expired|try again/i);
    return m ? m[0] : '';
  });
}

async function fillOtp(page, code) {
  console.error(`[invite] OTP challenge — entering code (len=${String(code || '').length})`);
  // Prefer real OTP fields; avoid generic input[type=text] which can miss Auth0 widgets.
  const candidates = [
    'input[name="code"]',
    'input[name="otp"]',
    'input[autocomplete="one-time-code"]',
    'input[inputmode="numeric"]',
    'input[type="tel"]',
    'input[aria-label*="code" i]',
    'input[placeholder*="code" i]',
  ];
  let filled = false;
  for (const sel of candidates) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) {
      await loc.waitFor({ state: 'visible', timeout: 15000 });
      await loc.fill('');
      await loc.fill(code);
      filled = true;
      break;
    }
  }
  if (!filled) {
    const fallback = page.locator('input[type="text"]').first();
    await fallback.waitFor({ state: 'visible', timeout: 15000 });
    await fallback.fill(code);
  }

  let trust = await tickTrustThisMachine(page);
  // Auth0 label: "Remember this device for 30 days"
  if (!trust.found) {
    try {
      const remember = page.getByText(/remember this device/i).first();
      if ((await remember.count()) > 0) {
        await remember.click({ timeout: 3000 });
        trust = { found: true, text: 'remember this device (click)', checked: true };
      }
    } catch {
      /* ignore */
    }
  }
  try {
    fs.writeFileSync(path.join(LOG_DIR, 'otp-trust-checkbox.json'), JSON.stringify(trust, null, 2));
    await page.screenshot({ path: path.join(LOG_DIR, 'otp-challenge.png') });
  } catch {
    /* ignore */
  }

  await page
    .locator('button:has-text("Continue"), button:has-text("Verify"), button:has-text("Submit"), button[type="submit"]')
    .first()
    .click();
  try {
    await withSpinner('Waiting for OTP accept', () =>
      page.waitForURL((u) => !String(u).includes('mfa-otp-challenge'), { timeout: 15000 })
    );
  } catch {
    /* still on challenge — read error below */
  }
  await pause(1000, 'Settle after OTP');
  const err = await readOtpPageError(page);
  if (err) {
    console.error(`[invite] OTP rejected by Awin: ${err}`);
  }
  try {
    await page.screenshot({ path: path.join(LOG_DIR, 'otp-after-submit.png') });
  } catch {
    /* ignore */
  }
  return { trust, error: err || null, stillOnChallenge: page.url().includes('mfa-otp-challenge') };
}

async function ensureSignedIn(page) {
  const target = `https://ui.awin.com/awin/affiliate/${PUBLISHER_ID}/merchant-directory/index/tab/notJoined/page/1`;
  await withSpinner('Opening Awin publisher UI', () =>
    page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90000 })
  );
  await pause(2000, 'Page settle');
  let url = page.url();
  if (url.includes(`/affiliate/${PUBLISHER_ID}/`) && !url.includes('id.awin.com')) {
    return { status: 'already_signed_in', url };
  }
  if (url.includes('mfa-otp-challenge')) {
    if (!OTP) {
      console.error('[invite] MFA required — pass -Otp <code> (or env AWIN_OTP)');
      return { status: 'needs_otp', url };
    }
    const otpResult = await fillOtp(page, OTP);
    if (otpResult.stillOnChallenge || page.url().includes('mfa-otp-challenge')) {
      return {
        status: 'otp_failed',
        url: page.url(),
        error: otpResult.error || 'still on mfa-otp-challenge after submit',
      };
    }
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await pause(2000, 'Page settle');
    url = page.url();
    if (url.includes('mfa-otp-challenge')) {
      return { status: 'otp_failed', url, error: 'redirected back to MFA' };
    }
    if (url.includes(`/affiliate/${PUBLISHER_ID}/`)) return { status: 'signed_in', url };
    return { status: 'sign_in_failed', url };
  }

  const { email, password } = readSecrets();
  await page.waitForSelector('input[type="email"], input[name="username"], input#username', { timeout: 30000 });
  await page.fill('input[type="email"], input[name="username"], input#username', email);
  await page.locator('button:has-text("Continue"), button[type="submit"]').first().click();
  await pause(1500, 'Page settle');

  async function handleMfaIfPresent() {
    if (!page.url().includes('mfa-otp-challenge')) return null;
    if (!OTP) {
      console.error('[invite] MFA required — pass -Otp <code> (or env AWIN_OTP)');
      return { status: 'needs_otp', url: page.url() };
    }
    const otpResult = await fillOtp(page, OTP);
    if (otpResult.stillOnChallenge || page.url().includes('mfa-otp-challenge')) {
      return {
        status: 'otp_failed',
        url: page.url(),
        error: otpResult.error || 'still on mfa-otp-challenge after submit',
      };
    }
    return null;
  }

  {
    const early = await handleMfaIfPresent();
    if (early) return early;
  }
  if ((await page.locator('input[type="password"]').count()) > 0) {
    await page.fill('input[type="password"]', password);
    await page.locator('button:has-text("Log in"), button:has-text("Sign in"), button[type="submit"]').first().click();
    await pause(3000, 'Page settle');
    const afterPw = await handleMfaIfPresent();
    if (afterPw) return afterPw;
  }

  if (page.url().includes('mfa-otp-challenge')) {
    return { status: 'needs_otp', url: page.url() };
  }
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await pause(3000, 'Page settle');
  if (!page.url().includes(`/affiliate/${PUBLISHER_ID}/`)) {
    return { status: 'sign_in_failed', url: page.url() };
  }
  return { status: 'signed_in', url: page.url() };
}

async function scrapeJoinRowsRaw(page) {
  await page
    .waitForSelector('.join-button[data-merchantid], [id^="action"][title="Join Program"]', { timeout: 120000 })
    .catch(() => null);
  await pause(1000, 'Page settle');

  return page.evaluate((publisherId) => {
    const out = [];
    const buttons = Array.from(
      document.querySelectorAll('.join-button[data-merchantid], span[id^="action"][title="Join Program"]')
    );
    for (const btn of buttons) {
      const id = btn.getAttribute('data-merchantid') || (btn.id || '').replace(/^action/, '');
      if (!id || id === publisherId) continue;
      const tr = btn.closest('tr');
      const nameLink = tr?.querySelector('a[href*="merchant-profile"]');
      const name = (nameLink?.textContent || '').trim().replace(/\s+/g, ' ');
      if (!name) continue;
      const cells = tr ? Array.from(tr.querySelectorAll('td')) : [];
      const headers = tr
        ? Array.from(tr.closest('table')?.querySelectorAll('th') || []).map((th) =>
            (th.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase()
          )
        : [];
      const cellBy = (pred) => {
        const idx = headers.findIndex(pred);
        return idx >= 0 ? (cells[idx]?.textContent || '').trim().replace(/\s+/g, ' ') : '';
      };
      const feedText = cellBy((h) => h.includes('product feed'));
      const approvalText = cellBy((h) => h.includes('approval'));
      const sector =
        cellBy((h) => h.includes('sector') || h.includes('vertical') || h.includes('category') || h === 'industry') ||
        '';
      const approval = parseFloat(String(approvalText).replace(/[^0-9.]/g, ''));
      const hasFeed = feedText.length > 0 && !/^n\/?a$/i.test(feedText) && !/^no$/i.test(feedText);
      out.push({
        id: String(id),
        name,
        sector,
        href: nameLink ? nameLink.href : '',
        feedText,
        hasFeed,
        approvalText,
        approval: Number.isFinite(approval) ? approval : null,
        actionSelector: btn.id ? `#${btn.id}` : `.join-button[data-merchantid="${id}"]`,
        rowText: (tr?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 240),
      });
    }
    return out;
  }, PUBLISHER_ID);
}

function filterAndRank(rawRows, index, stats) {
  const kept = [];
  for (const r of rawRows) {
    if (!r.id || r.id === PUBLISHER_ID) continue;
    if (isJunkName(r.name)) {
      stats.skippedJunk.push(r.id);
      continue;
    }
    const reason = classifySkip(r.id, index);
    if (reason === 'foldered') {
      stats.skippedFoldered.push(r.id);
      continue;
    }
    if (reason === 'cooldown_90d') {
      stats.skipped90d.push(r.id);
      continue;
    }
    kept.push(r);
  }
  return rankCandidates(kept);
}

async function clickRowAction(page, candidate) {
  const selectors = [
    candidate.actionSelector,
    `#action${candidate.id}`,
    `.join-button[data-merchantid="${candidate.id}"]`,
    `span[title="Join Program"][data-merchantid="${candidate.id}"]`,
  ].filter(Boolean);

  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) === 0) continue;
    if (!(await loc.isVisible().catch(() => false))) {
      await loc.scrollIntoViewIfNeeded().catch(() => {});
    }
    try {
      await loc.click({ timeout: 5000 });
      await pause(1500, 'Page settle');
      return { ok: true, selector: sel };
    } catch {
      try {
        await loc.click({ force: true, timeout: 5000 });
        await pause(1500, 'Page settle');
        return { ok: true, selector: sel, forced: true };
      } catch {
        /* next */
      }
    }
  }
  return { ok: false, reason: 'no_action_control', tried: selectors };
}

async function fillJoinModal(page, message) {
  const modal = page.locator('#membershipModal, .awinModalWindow').first();
  await modal.waitFor({ state: 'visible', timeout: 15000 });
  for (let i = 0; i < 20; i++) {
    if ((await page.locator('.blockUI.blockOverlay').count()) === 0) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(500);

  const promoOptions = [];
  const selects = modal.locator('select');
  const selectCount = await selects.count();
  for (let i = 0; i < selectCount; i++) {
    const sel = selects.nth(i);
    if (!(await sel.isVisible().catch(() => false))) continue;
    const opts = await sel.locator('option').evaluateAll((os) =>
      os.map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
    );
    if (opts.length < 2) continue;
    promoOptions.push(...opts.map((o) => o.text));
    const pick =
      opts.find((o) => /clubmadeira\.uk/i.test(o.text) && o.value) ||
      opts.find((o) => /^display$/i.test(o.text) && /^promoType:/i.test(o.value)) ||
      opts.find((o) => o.value && !/select|choose|please/i.test(o.text));
    if (!pick) return { ok: false, reason: 'promotion_type_unknown', promoOptions };
    await sel.selectOption(pick.value);
  }

  const urlField = modal.locator(
    'input[type="url"], input[name*="url" i], input[id*="url" i], input[placeholder*="URL" i], input[name*="website" i]'
  );
  for (let i = 0; i < (await urlField.count()); i++) {
    const f = urlField.nth(i);
    if (await f.isVisible().catch(() => false)) {
      await f.fill(PROMO_URL);
      break;
    }
  }

  const msgField = modal.locator('textarea');
  let filledMsg = false;
  for (let i = 0; i < (await msgField.count()); i++) {
    const f = msgField.nth(i);
    if (await f.isVisible().catch(() => false)) {
      if (message.length > 149) return { ok: false, reason: 'message_too_long', length: message.length };
      await f.fill(message);
      filledMsg = true;
      break;
    }
  }

  const checks = modal.locator('input[type="checkbox"]');
  for (let i = 0; i < (await checks.count()); i++) {
    const box = checks.nth(i);
    if (!(await box.isVisible().catch(() => false))) continue;
    if (!(await box.isChecked())) await box.check().catch(() => box.click({ force: true }));
  }

  return { ok: true, promoOptions, filledMsg };
}

async function submitJoinModal(page) {
  const modal = page.locator('#membershipModal, .awinModalWindow').first();
  await modal.waitFor({ state: 'visible', timeout: 10000 });
  for (let i = 0; i < 20; i++) {
    if ((await page.locator('.blockUI.blockOverlay').count()) === 0) break;
    await page.waitForTimeout(500);
  }
  const submit = modal.locator(
    'button:has-text("Join"), button:has-text("Submit"), button:has-text("Send request"), button:has-text("Send"), input[type="submit"], button[type="submit"]'
  );
  const n = await submit.count();
  for (let i = n - 1; i >= 0; i--) {
    const b = submit.nth(i);
    if (!(await b.isVisible().catch(() => false))) continue;
    const title = ((await b.getAttribute('title')) || '').toLowerCase();
    const name = ((await b.getAttribute('name')) || '').toLowerCase();
    if (title.includes('search') || name.includes('search')) continue;
    await b.click({ force: true });
    await pause(2500, 'Page settle');
    return { ok: true };
  }
  return { ok: false, reason: 'no_submit_button' };
}

async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(PROFILE, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  console.error(
    `[invite] starting live=${LIVE} max=${MAX} headed=${HEADED} otp=${OTP ? 'set' : 'none'} publisher=${PUBLISHER_ID}`
  );

  const lock = acquireLock(LOCK_PATH);
  if (!lock.ok) {
    const report = {
      tool: 'invite',
      alreadyRunning: true,
      code: 'already_running',
      startedAt: new Date().toISOString(),
    };
    console.error('[invite] already_running — another invite holds the lock');
    console.log(JSON.stringify(report));
    process.exitCode = 0;
    return;
  }

  const stats = {
    skippedFoldered: [],
    skipped90d: [],
    skippedJunk: [],
  };

  const report = {
    tool: 'invite',
    live: LIVE,
    max: MAX,
    cooldownDays: COOLDOWN_DAYS,
    startedAt: new Date().toISOString(),
    signIn: null,
    needsOtp: false,
    candidates: [],
    skippedFoldered: [],
    skipped90d: [],
    skippedJunk: [],
    applied: [],
    failed: [],
  };

  let context;
  try {
    const index = loadInviteIndex({
      affiliatesRoot: AFFILIATES_ROOT,
      cooldownDays: COOLDOWN_DAYS,
    });

    const statePath = path.join(PROFILE, 'storage-state.json');
    context = await chromium.launchPersistentContext(PROFILE, {
      headless: !HEADED,
      viewport: { width: 1400, height: 900 },
    });
    const page = context.pages()[0] || (await context.newPage());

    report.signIn = await ensureSignedIn(page);
    try {
      await context.storageState({ path: statePath });
    } catch {
      /* ignore */
    }

    if (report.signIn.status === 'needs_otp') {
      report.needsOtp = true;
      try {
        await page.screenshot({ path: path.join(LOG_DIR, 'invite-needs-otp.png') });
      } catch {
        /* ignore */
      }
      console.error('[invite] STOP: needs OTP from Simon (Authenticator). Re-run: invite -Max N -Otp <code>');
      finishReport(report);
      try {
        await context.close();
      } catch {
        /* ignore */
      }
      context = null;
      releaseLock(LOCK_PATH);
      process.exit(2);
    }
    if (report.signIn.status === 'otp_failed') {
      report.needsOtp = true;
      report.otpError = report.signIn.error || null;
      try {
        await page.screenshot({ path: path.join(LOG_DIR, 'invite-otp-failed.png') });
      } catch {
        /* ignore */
      }
      console.error(
        `[invite] STOP: OTP rejected or expired (${report.signIn.error || 'unknown'}). Ask Simon for a fresh code.`
      );
      finishReport(report);
      try {
        await context.close();
      } catch {
        /* ignore */
      }
      context = null;
      releaseLock(LOCK_PATH);
      process.exit(2);
    }
    if (!String(report.signIn.status).includes('signed')) {
      console.error(`[invite] STOP: sign-in failed status=${report.signIn.status}`);
      finishReport(report);
      try {
        await context.close();
      } catch {
        /* ignore */
      }
      context = null;
      releaseLock(LOCK_PATH);
      process.exit(1);
    }

    const listUrl = `https://ui.awin.com/awin/affiliate/${PUBLISHER_ID}/merchant-directory/index/tab/notJoined/page/1`;
    await withSpinner('Loading Join Programmes', () =>
      page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
    );
    let tableReady = false;
    await withSpinner('Waiting for Join Programmes table', async () => {
      for (let i = 0; i < 48; i++) {
        const joinBtns = await page
          .locator('.join-button[data-merchantid], [id^="action"][title="Join Program"]')
          .count();
        if (joinBtns > 0) {
          tableReady = true;
          return;
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
    });
    report.tableReady = tableReady;
    await page.screenshot({ path: path.join(LOG_DIR, 'invite-notjoined.png') }).catch(() => {});

    const raw = await scrapeJoinRowsRaw(page);
    fs.writeFileSync(path.join(LOG_DIR, 'invite-rows-raw.json'), JSON.stringify(raw.slice(0, 40), null, 2));
    const ranked = filterAndRank(raw, index, stats);
    report.skippedFoldered = stats.skippedFoldered;
    report.skipped90d = stats.skipped90d;
    report.skippedJunk = stats.skippedJunk;
    report.candidates = ranked.slice(0, MAX).map((r) => ({
      id: r.id,
      name: asciiFold(r.name),
      sector: asciiFold(r.sector || ''),
      hasFeed: !!r.hasFeed,
      approval: r.approval,
    }));

    const batch = ranked.slice(0, MAX);
    const usedMsgs = new Set();

    console.error(`[invite] batch size=${batch.length} live=${LIVE}`);
    for (const c of batch) {
      const msg = uniqueInviteMessage(c, usedMsgs);
      try {
        console.error(`[invite] ${LIVE ? 'submit' : 'dry-run'} id=${c.id} name=${asciiFold(c.name)}`);
        if (!page.url().includes('notJoined')) {
          await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
          await pause(2500, 'Page settle');
        }
        const click = await clickRowAction(page, c);
        if (!click.ok) {
          console.error(`[invite] FAIL click id=${c.id}: ${click.reason}`);
          report.failed.push({ id: c.id, name: asciiFold(c.name), reason: click.reason });
          continue;
        }
        const modal = await fillJoinModal(page, msg);
        if (!modal.ok) {
          console.error(`[invite] FAIL modal id=${c.id}: ${modal.reason}`);
          report.failed.push({
            id: c.id,
            name: asciiFold(c.name),
            reason: modal.reason,
          });
          const cancel = page.locator('#membershipModal button:has-text("Cancel"), #membershipModal button:has-text("Close")');
          if ((await cancel.count()) > 0) await cancel.first().click().catch(() => {});
          break;
        }

        if (!LIVE) {
          const cancel = page.locator(
            '#membershipModal button:has-text("Cancel"), #membershipModal button:has-text("Close"), #membershipModal .close'
          );
          if ((await cancel.count()) > 0) await cancel.first().click({ force: true }).catch(() => {});
          report.applied.push({
            id: c.id,
            name: asciiFold(c.name),
            sector: asciiFold(c.sector || ''),
            dryRun: true,
            messageLen: msg.length,
          });
          console.error(`[invite] dry-run ok id=${c.id} messageLen=${msg.length}`);
        } else {
          const submitted = await submitJoinModal(page);
          if (!submitted.ok) {
            console.error(`[invite] FAIL submit id=${c.id}: ${submitted.reason}`);
            report.failed.push({ id: c.id, name: asciiFold(c.name), reason: submitted.reason });
            continue;
          }
          console.error(`[invite] writing _invites/${c.id}/ marker`);
          const existing = index.invites.get(c.id);
          writeInviteMarkerAws({
            id: c.id,
            name: c.name,
            msg,
            logDir: LOG_DIR,
            existing: existing
              ? {
                  firstinvitedat: existing.firstinvitedat,
                  invitecount: existing.invitecount,
                }
              : null,
            source: 'invite',
          });
          report.applied.push({
            id: c.id,
            name: asciiFold(c.name),
            sector: asciiFold(c.sector || ''),
            dryRun: false,
            messageLen: msg.length,
          });
          console.error(`[invite] LIVE ok id=${c.id}`);
          await pause(30000, `Cooldown before next invite (${c.id} done)`);
        }

        await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await pause(2000, 'Page settle');
      } catch (e) {
        report.failed.push({ id: c.id, name: asciiFold(c.name), reason: String(e.message || e) });
      }
    }

    finishReport(report);
    process.exitCode = report.failed.length && !report.applied.length ? 1 : 0;
  } catch (e) {
    report.failed.push({ id: '_run', reason: String(e.message || e) });
    finishReport(report);
    process.exitCode = 1;
  } finally {
    try {
      if (context) await context.close();
    } catch {
      /* ignore */
    }
    releaseLock(LOCK_PATH);
  }
}

function finishReport(report) {
  report.finishedAt = new Date().toISOString();
  report.counts = {
    candidates: (report.candidates || []).length,
    skippedFoldered: (report.skippedFoldered || []).length,
    skipped90d: (report.skipped90d || []).length,
    applied: (report.applied || []).length,
    failed: (report.failed || []).length,
    needsOtp: !!report.needsOtp,
  };
  const day = new Date().toISOString().slice(0, 10);
  const reportPath = path.join(REPORT_DIR, `${day}.json`);
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    report.reportPath = reportPath;
  } catch {
    /* ignore */
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  releaseLock(LOCK_PATH);
  process.exit(1);
});
