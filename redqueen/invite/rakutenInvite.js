'use strict';

/**
 * FR #5065: Rakuten invite backend (Advertisers + Partnerships API; apply is UI).
 * Records live under {provider}/_invites/{mid}/ (Awin shape). No password temp file.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_COOLDOWN_DAYS = 90;
const DEFAULT_MAX_MSG = 500;
const TOKEN_URL_DEFAULT = 'https://api.linksynergy.com/token';
const ADVERTISERS_URL = 'https://api.linksynergy.com/v2/advertisers';
const PARTNERSHIPS_URL = 'https://api.linksynergy.com/v1/partnerships';

const SEED_LIVE = new Set(['54397']);
const SEED_PENDING = new Set(['54054', '54318', '54090', '54110', '53579']);
const SEED_PENDING_NAMES = [/christow/i];

function asciiFold(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

function trimToMax(msg, max) {
  const cap = Number(max) > 0 ? Number(max) : DEFAULT_MAX_MSG;
  let m = String(msg || '').trim().replace(/\s+/g, ' ');
  while (m.length > cap) {
    const cut = m.lastIndexOf(' ', cap);
    m = (cut > 40 ? m.slice(0, cut) : m.slice(0, cap)).trim();
  }
  return m;
}

function parseMessageCharLimit(text, fallback) {
  const m = String(text || '').match(/(\d+)\s*char/i);
  if (m) return Math.min(2000, Math.max(40, Number(m[1])));
  return fallback || DEFAULT_MAX_MSG;
}

function craftRakutenMessage(candidate, opts = {}) {
  const max = opts.maxMsg != null ? opts.maxMsg : DEFAULT_MAX_MSG;
  const name = asciiFold(candidate && candidate.name) || 'your brand';
  const sector = asciiFold(
    (candidate && (candidate.sector || candidate.vertical || '')) || '',
  );
  const raw = sector
    ? `Club Madeira / Smart Catalogue members shop ${sector}. ${name} is a strong UK fit --- we apply with tracked links only.`
    : `Club Madeira / Smart Catalogue would like to partner with ${name} for UK club members via tracked links.`;
  return trimToMax(raw, max);
}

function uniqueRakutenMessage(candidate, used, opts) {
  const set = used || new Set();
  let msg = craftRakutenMessage(candidate, opts);
  if (!set.has(msg)) {
    set.add(msg);
    return msg;
  }
  const tag = asciiFold((candidate && candidate.id) || 'x').slice(0, 12);
  msg = trimToMax(`${msg} (ref ${tag})`, (opts && opts.maxMsg) || DEFAULT_MAX_MSG);
  set.add(msg);
  return msg;
}

function isWithinCooldown(invitedat, now, days) {
  if (!invitedat) return false;
  const d = invitedat instanceof Date ? invitedat : new Date(String(invitedat));
  if (Number.isNaN(d.getTime())) return false;
  const n = now || new Date();
  return n.getTime() - d.getTime() < (days || DEFAULT_COOLDOWN_DAYS) * 86400000;
}

function hobbyScore(advertiser) {
  const cats = []
    .concat((advertiser && advertiser.categories) || [])
    .concat((advertiser && advertiser.category) || [])
    .map((c) => String(c).toLowerCase())
    .join(' ');
  const name = String((advertiser && advertiser.name) || '').toLowerCase();
  const blob = `${cats} ${name}`;
  if (/model.?fly|radio.?control|\brc\b|hobby|drone|aircraft/.test(blob)) {
    return 2000;
  }
  return 0;
}

function rankRakutenAdvertisers(rows) {
  return [...rows].sort((a, b) => {
    const ds = hobbyScore(b) - hobbyScore(a);
    if (ds !== 0) return ds;
    return String(a.id).localeCompare(String(b.id), 'en', { numeric: true });
  });
}

function partnershipStatus(row) {
  return String((row && (row.status || row.partnershipStatus)) || '')
    .trim()
    .toLowerCase();
}

function advertiserIdOf(row) {
  return String(
    (row && (row.advertiserId || row.advertiser_id || row.id || row.mid)) || '',
  ).trim();
}

function classifyRakutenSkip(id, name, ctx) {
  const sid = String(id || '').trim();
  if (!sid && name && SEED_PENDING_NAMES.some((re) => re.test(String(name)))) {
    return 'pending_seed';
  }
  if (SEED_LIVE.has(sid)) return 'live_seed';
  if (SEED_PENDING.has(sid)) return 'pending_seed';
  const st = ctx && ctx.statusById && ctx.statusById.get(sid);
  if (st === 'approved' || st === 'active' || st === 'live') return 'approved';
  if (st === 'pending') return 'pending';
  if (st === 'declined' || st === 'rejected' || (ctx.declinedAt && ctx.declinedAt.has(sid))) {
    const when = ctx.declinedAt && ctx.declinedAt.get(sid);
    if (isWithinCooldown(when, ctx.now, ctx.cooldownDays)) return 'cooldown_90d';
  }
  if (ctx && ctx.inviteIds && ctx.inviteIds.has(sid)) {
    const when = ctx.invitedAt && ctx.invitedAt.get(sid);
    if (isWithinCooldown(when, ctx.now, ctx.cooldownDays)) return 'cooldown_90d';
    if (when) return 'cooldown_90d';
  }
  return null;
}

function redactSecrets(text, secrets) {
  let out = String(text || '');
  for (const s of secrets || []) {
    if (s && String(s).length >= 3) {
      const re = new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      out = out.replace(re, '***');
    }
  }
  out = out.replace(/(api[_-]?key|token|password|secret|bearer)\s*[:=]\s*\S+/gi, '$1=***');
  return out;
}

async function defaultHttpJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: String(text).slice(0, 200) };
  }
  if (!res.ok) {
    const err = new Error(`rakuten_http_${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function fetchRakutenToken(deps) {
  if (deps && typeof deps.fetchToken === 'function') {
    return deps.fetchToken();
  }
  const env = (deps && deps.env) || process.env;
  const id = String(env.RAKUTEN_CLIENT_ID || '').trim();
  const secret = String(env.RAKUTEN_CLIENT_SECRET || '').trim();
  const sid = String(env.RAKUTEN_SID || '').trim();
  const tokenUrl = String(env.RAKUTEN_TOKEN_URL || TOKEN_URL_DEFAULT).trim();
  if (!id || !secret) {
    const err = new Error('rakuten_missing_credentials');
    err.code = 'rakuten_missing_credentials';
    throw err;
  }
  const http = deps.httpJson || defaultHttpJson;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: sid || '3419316',
  }).toString();
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const json = await http(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const token = json.access_token || json.token;
  if (!token) {
    const err = new Error('rakuten_token_missing');
    err.code = 'rakuten_token_missing';
    throw err;
  }
  return String(token);
}

function advertisersFromPayload(json) {
  const rows =
    (json && json.advertisers) ||
    (json && json.advertiser) ||
    (json && json.items) ||
    [];
  return rows
    .map((r) => ({
      id: advertiserIdOf(r),
      name: String((r && (r.name || r.advertiserName)) || '').trim(),
      categories: r.categories || r.category || [],
    }))
    .filter((r) => r.id);
}

function partnershipsFromPayload(json) {
  const rows =
    (json && json.partnerships) ||
    (json && json.partnership) ||
    (json && json.items) ||
    [];
  return rows.map((r) => ({
    id: advertiserIdOf(r),
    name: String((r && (r.name || r.advertiserName)) || '').trim(),
    status: partnershipStatus(r),
    updated: r.updatedAt || r.updated || r.date || null,
  }));
}

/**
 * @param {object} opts
 */
async function runRakutenInvite(opts = {}) {
  const now = opts.now || new Date();
  const dryRun = opts.live === true ? false : opts.dryRun !== false;
  const max = Number(opts.max) > 0 ? Number(opts.max) : 20;
  const maxMsg = parseMessageCharLimit(opts.agentMd || '', DEFAULT_MAX_MSG);
  const reportDir =
    opts.reportDir ||
    path.join('C:', 'ai', 'a-search', 'logs', 'rakuten-invite');
  const secretsHeld = [];

  const http = opts.httpJson || defaultHttpJson;
  let token;
  try {
    token = await fetchRakutenToken({
      env: opts.env || process.env,
      fetchToken: opts.fetchToken,
      httpJson: http,
    });
  } catch (err) {
    if (err && err.code === 'rakuten_missing_credentials') throw err;
    throw err;
  }
  if (token && String(token).length >= 8) secretsHeld.push(String(token));

  const headers = { Authorization: `Bearer ${token}` };
  const advJson = await http(ADVERTISERS_URL, { headers });
  const partJson = await http(PARTNERSHIPS_URL, { headers });
  const advertisers = advertisersFromPayload(advJson);
  const partnerships = partnershipsFromPayload(partJson);

  const statusById = new Map();
  const declinedAt = new Map();
  const inviteIds = new Set(opts.inviteIds || []);
  const invitedAt = new Map(opts.invitedAt || []);
  for (const p of partnerships) {
    if (!p.id) continue;
    statusById.set(p.id, p.status);
    if (p.status === 'declined' || p.status === 'rejected') {
      declinedAt.set(p.id, p.updated || now.toISOString());
    }
    if (p.status === 'pending' || p.status === 'approved' || p.status === 'live') {
      inviteIds.add(p.id);
    }
  }

  const ctx = {
    statusById,
    declinedAt,
    inviteIds,
    invitedAt,
    now,
    cooldownDays: DEFAULT_COOLDOWN_DAYS,
  };

  const used = new Set();
  const ranked = [];
  for (const a of rankRakutenAdvertisers(advertisers)) {
    const skip = classifyRakutenSkip(a.id, a.name, ctx);
    if (skip) continue;
    ranked.push({
      id: a.id,
      name: a.name,
      message: uniqueRakutenMessage(a, used, { maxMsg }),
    });
  }
  const candidates = ranked.slice(0, max);

  const applied = [];
  const writes = [];
  if (!dryRun) {
    const apply = opts.apply;
    if (typeof apply !== 'function') {
      const err = new Error('rakuten_apply_needs_browser');
      err.code = 'rakuten_apply_needs_browser';
      err.exitCode = 2;
      throw err;
    }
    for (const c of candidates) {
      const result = await apply(c);
      if (result && result.code === 'captcha') {
        const err = new Error('rakuten_captcha');
        err.code = 'rakuten_captcha';
        err.exitCode = 2;
        throw err;
      }
      if (result && result.ok) {
        applied.push({ id: c.id, name: c.name });
        writes.push({ id: c.id, name: c.name, message: c.message });
        if (typeof opts.writeInviteRecord === 'function') {
          await opts.writeInviteRecord({
            id: c.id,
            name: c.name,
            message: c.message,
            provider: 'rakuten',
            prefix: '_invites',
          });
        }
        if (opts.crashAfterApplications != null &&
          applied.length >= Number(opts.crashAfterApplications)) {
          const err = new Error('invite_crash_after_record');
          err.code = 'invite_crash_after_record';
          err.applied = applied.slice();
          throw err;
        }
      }
    }
  }

  const report = {
    provider: 'rakuten',
    live: !dryRun,
    signIn: { status: 'api' },
    counts: {
      candidates: candidates.length,
      applied: applied.length,
      failed: 0,
    },
    candidates: candidates.map((c) => ({
      id: c.id,
      name: c.name,
      message: c.message,
    })),
    applied: applied.map((a) => ({ id: a.id, name: a.name })),
    needsOtp: false,
  };
  const safe = redactSecrets(JSON.stringify(report), secretsHeld);
  if (!dryRun || opts.writeDryReport) {
    fs.mkdirSync(reportDir, { recursive: true });
    const day = now.toISOString().slice(0, 10);
    fs.writeFileSync(path.join(reportDir, `${day}.json`), safe);
  }
  return {
    ok: true,
    dryRun,
    report: JSON.parse(safe),
    writes,
    partnerships,
  };
}

module.exports = {
  DEFAULT_COOLDOWN_DAYS,
  DEFAULT_MAX_MSG,
  SEED_LIVE,
  SEED_PENDING,
  asciiFold,
  trimToMax,
  parseMessageCharLimit,
  craftRakutenMessage,
  uniqueRakutenMessage,
  isWithinCooldown,
  classifyRakutenSkip,
  rankRakutenAdvertisers,
  hobbyScore,
  redactSecrets,
  advertisersFromPayload,
  partnershipsFromPayload,
  fetchRakutenToken,
  runRakutenInvite,
  ADVERTISERS_URL,
  PARTNERSHIPS_URL,
};
