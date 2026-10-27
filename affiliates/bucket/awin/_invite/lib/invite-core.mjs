/**
 * Pure helpers for deterministic Awin invite scheduler (no LLM).
 * 90-day _invites gate + field-personalised join messages (<=149 chars).
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export const DEFAULT_COOLDOWN_DAYS = 90;
export const MAX_MSG = 149;

export function asciiFold(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

export function trimTo149(msg) {
  let m = String(msg || '').trim().replace(/\s+/g, ' ');
  while (m.length > MAX_MSG) {
    const cut = m.lastIndexOf(' ', MAX_MSG);
    m = (cut > 40 ? m.slice(0, cut) : m.slice(0, MAX_MSG)).trim();
  }
  return m;
}

/**
 * Deterministic personalised join message from scraped fields.
 * Unique per advertiser via name/sector/feed; never a single fixed string for all.
 */
export function craftInviteMessage(candidate, opts = {}) {
  const name = asciiFold(candidate?.name) || 'your brand';
  const sector = asciiFold(candidate?.sector || candidate?.vertical || '');
  const hasFeed = !!candidate?.hasFeed;
  const approval =
    candidate?.approval != null && Number.isFinite(Number(candidate.approval))
      ? Math.round(Number(candidate.approval))
      : null;
  const disambig = asciiFold(opts.disambig || '');

  const variants = [];
  if (sector && hasFeed) {
    variants.push(
      `Club Madeira / Smart Catalogue fits ${name} (${sector}) well — UK clubs browse your product feed via tracked links. Keen to feature you.`
    );
    variants.push(
      `Smart Catalogue members shop ${sector} brands like ${name}. Your feed suits our UK clubs; happy to promote via tracked links.`
    );
  }
  if (sector) {
    variants.push(
      `Club Madeira lists ${sector} advertisers for UK clubs. ${name} looks a strong fit — members shop via tracked affiliate links.`
    );
    variants.push(
      `${name} in ${sector} suits Club Madeira / Smart Catalogue members. We'd like to join and feature your programme.`
    );
  }
  if (hasFeed) {
    variants.push(
      `Club Madeira / Smart Catalogue lists ${name} for UK clubs; your product feed suits members who shop via tracked links. Happy to join.`
    );
  }
  if (approval != null && approval >= 70) {
    variants.push(
      `Club Madeira would like to join ${name} (${approval}% approval). UK club members shop via tracked links on Smart Catalogue.`
    );
  }
  variants.push(
    `Club Madeira / Smart Catalogue lists ${name} for UK clubs; members shop via tracked links. Happy to feature your catalogue.`
  );
  variants.push(
    `Club Madeira lists ${name} for UK clubs via tracked links. Happy to feature your catalogue.`
  );
  variants.push(`Club Madeira lists ${name} for UK clubs. Happy to feature your catalogue.`);

  let msg = trimTo149(variants[0]);
  for (const v of variants) {
    const t = trimTo149(v);
    if (t.length >= 40 && t.length <= MAX_MSG) {
      msg = t;
      break;
    }
  }

  if (disambig) {
    const withTag = trimTo149(`${msg} (${disambig})`);
    if (withTag.length <= MAX_MSG) msg = withTag;
  }

  return msg;
}

/** Ensure messages in one run are unique; mutate used Set. */
export function uniqueInviteMessage(candidate, used) {
  let msg = craftInviteMessage(candidate);
  if (!used.has(msg)) {
    used.add(msg);
    return msg;
  }
  const extras = [
    candidate?.id ? `ref ${candidate.id}` : '',
    candidate?.sector ? asciiFold(candidate.sector).slice(0, 24) : '',
    'UK clubs',
    'Smart Catalogue',
    'tracked links',
  ].filter(Boolean);
  for (const d of extras) {
    msg = craftInviteMessage(candidate, { disambig: d });
    if (!used.has(msg)) {
      used.add(msg);
      return msg;
    }
  }
  // Last resort: pad with id digits
  msg = trimTo149(`${craftInviteMessage(candidate)} #${candidate?.id || 'x'}`);
  used.add(msg);
  return msg;
}

export function parseInvitedAt(raw) {
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isWithinCooldown(invitedat, now = new Date(), days = DEFAULT_COOLDOWN_DAYS) {
  const d = invitedat instanceof Date ? invitedat : parseInvitedAt(invitedat);
  if (!d) return false;
  const ms = days * 24 * 60 * 60 * 1000;
  return now.getTime() - d.getTime() < ms;
}

export function listDigitPrefixes(rootDir) {
  const set = new Set();
  if (!rootDir || !fs.existsSync(rootDir)) return set;
  for (const name of fs.readdirSync(rootDir)) {
    if (/^\d+$/.test(name)) set.add(name);
  }
  return set;
}

/**
 * Load invite markers via aws head-object (authoritative invitedat).
 * Falls back to mount folder names with unknown dates (treated as blocked).
 */
export function loadInviteIndex(opts = {}) {
  const bucket = opts.bucket || 'a-affiliates';
  const provider = opts.provider || 'awin';
  const affiliatesRoot = opts.affiliatesRoot || 'S:\\a-affiliates\\awin';
  const cooldownDays = opts.cooldownDays ?? DEFAULT_COOLDOWN_DAYS;
  const now = opts.now || new Date();
  const awsProfile = opts.awsProfile || process.env.AWS_PROFILE || 'a-search-redqueen-agents';

  const folders = listDigitPrefixes(affiliatesRoot);
  const inviteRoot = path.join(affiliatesRoot, '_invites');
  const inviteIds = listDigitPrefixes(inviteRoot);
  /** @type {Map<string, { invitedat: string|null, firstinvitedat: string|null, invitecount: number, blocked90d: boolean }>} */
  const invites = new Map();

  for (const id of inviteIds) {
    let invitedat = null;
    let firstinvitedat = null;
    let invitecount = 1;
    try {
      const head = execFileSync(
        'aws',
        [
          's3api',
          'head-object',
          '--bucket',
          bucket,
          '--key',
          `${provider}/_invites/${id}/`,
          '--output',
          'json',
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, AWS_PROFILE: awsProfile },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      const parsed = JSON.parse(head);
      const m = parsed.Metadata || {};
      invitedat = m.invitedat || m.Invitedat || null;
      firstinvitedat = m.firstinvitedat || m.Firstinvitedat || invitedat;
      if (m.invitecount) invitecount = parseInt(m.invitecount, 10) || 1;
    } catch {
      // Mount exists but head failed: treat as blocked to be safe
      invitedat = now.toISOString();
    }
    invites.set(id, {
      invitedat,
      firstinvitedat,
      invitecount,
      blocked90d: isWithinCooldown(invitedat, now, cooldownDays),
    });
  }

  return { folders, invites, cooldownDays, now };
}

export function classifySkip(id, index) {
  if (index.folders.has(id)) return 'foldered';
  const inv = index.invites.get(id);
  if (inv && inv.blocked90d) return 'cooldown_90d';
  return null;
}

export function scoreCandidate(r) {
  return (r.hasFeed ? 1000 : 0) + (r.approval != null ? Number(r.approval) : 0);
}

export function rankCandidates(rows) {
  return [...rows].sort((a, b) => {
    const ds = scoreCandidate(b) - scoreCandidate(a);
    if (ds !== 0) return ds;
    return String(a.id).localeCompare(String(b.id), 'en', { numeric: true });
  });
}

export function isJunkName(name) {
  return /test program|please ignore|do not join|ignore this/i.test(String(name || ''));
}

export function writeInviteMarkerAws(opts) {
  const {
    id,
    name,
    msg,
    bucket = 'a-affiliates',
    provider = 'awin',
    awsProfile = process.env.AWS_PROFILE || 'a-search-redqueen-agents',
    logDir,
    existing,
    source = 'invite',
  } = opts;
  const key = `${provider}/_invites/${id}/`;
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  let first = existing?.firstinvitedat || now;
  let count = existing?.invitecount ? Number(existing.invitecount) + 1 : 1;
  if (!existing) {
    try {
      // 404 = new invite marker (expected). Keep aws stderr quiet so operators
      // do not think the live run failed.
      const head = execFileSync(
        'aws',
        ['s3api', 'head-object', '--bucket', bucket, '--key', key, '--output', 'json'],
        {
          encoding: 'utf8',
          env: { ...process.env, AWS_PROFILE: awsProfile },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      const m = JSON.parse(head).Metadata || {};
      if (m.firstinvitedat) first = m.firstinvitedat;
      if (m.invitecount) count = (parseInt(m.invitecount, 10) || 0) + 1;
    } catch {
      /* create — Not Found is normal for first invite */
    }
  }
  const meta = {
    invitedat: now,
    firstinvitedat: first,
    invitecount: String(count),
    name: asciiFold(name),
    invitemsg: asciiFold(msg).slice(0, MAX_MSG),
    source,
  };
  const metaPath = path.join(logDir || path.join(process.env.TEMP || 'C:\\Temp'), `invite-meta-${id}.json`);
  fs.writeFileSync(metaPath, JSON.stringify(meta));
  try {
    execFileSync(
      'aws',
      [
        's3api',
        'put-object',
        '--bucket',
        bucket,
        '--key',
        key,
        '--content-length',
        '0',
        '--server-side-encryption',
        'AES256',
        '--metadata',
        `file://${metaPath}`,
      ],
      { encoding: 'utf8', env: { ...process.env, AWS_PROFILE: awsProfile } }
    );
  } finally {
    try {
      fs.unlinkSync(metaPath);
    } catch {
      /* ignore */
    }
  }
  return meta;
}

export function acquireLock(lockPath) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(fd, String(process.pid));
    fs.closeSync(fd);
    return { ok: true };
  } catch (e) {
    if (e && e.code === 'EEXIST') {
      let stale = false;
      try {
        const pid = parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10);
        // Windows: if we cannot signal, leave lock (conservative)
        if (!pid) stale = true;
      } catch {
        stale = true;
      }
      if (stale) {
        try {
          fs.unlinkSync(lockPath);
          return acquireLock(lockPath);
        } catch {
          /* fall through */
        }
      }
      return { ok: false, code: 'already_running' };
    }
    throw e;
  }
}

export function releaseLock(lockPath) {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* ignore */
  }
}
