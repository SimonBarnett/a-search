'use strict';

/**
 * FR #4123: daily Awin onboarding agent — DryRun, merge folders, secrets,
 * OTP stop, daily limits, single-instance lock.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createMemoryS3 } = require('../affiliates/src/memoryS3');
const { acquireAwinAgentLock } = require('../redqueen/awin-agent/src/lock');
const {
  readAwinSecretFile,
  assertNoSecrets,
} = require('../redqueen/awin-agent/src/secrets');
const { resolveDailyLimits, takeUpTo } = require('../redqueen/awin-agent/src/limits');
const { isOtpChallengeUrl } = require('../redqueen/awin-agent/src/session');
const {
  upsertAwinAffiliateFolder,
} = require('../redqueen/awin-agent/src/folderUpsert');
const { runAwinAgent, parseArgs } = require('../redqueen/awin-agent/src/run');

const FAKE_PASSWORD = 'FAKE_awin_password_example_only';
const FAKE_EMAIL = 'fake.publisher@example.invalid';
const FAKE_TOKEN = 'FAKE_apitoken_example_only';

describe('FR #4123 awin agent unit', () => {
  /** @type {string[]} */
  let tmpDirs;

  beforeEach(() => {
    tmpDirs = [];
  });

  afterEach(() => {
    for (const d of tmpDirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  function tmp() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4123-'));
    tmpDirs.push(d);
    return d;
  }

  function secretFile() {
    const dir = tmp();
    const p = path.join(dir, 'awin.secret.txt');
    fs.writeFileSync(p, `${FAKE_EMAIL}\r\n${FAKE_PASSWORD}\r\n`, 'utf8');
    return p;
  }

  it('parseArgs recognizes -DryRun', () => {
    assert.equal(parseArgs(['-DryRun']).dryRun, true);
    assert.equal(parseArgs([]).dryRun, false);
  });

  it('single-instance lock: second acquire is already_running', () => {
    const lockPath = path.join(tmp(), 'awin-agent.lock');
    const a = acquireAwinAgentLock(lockPath, { now: () => 1_000_000 });
    assert.equal(a.ok, true);
    const b = acquireAwinAgentLock(lockPath, { now: () => 1_000_100 });
    assert.equal(b.ok, false);
    assert.equal(b.code, 'already_running');
    a.release();
  });

  it('daily limits cap invite/join lists', () => {
    const lim = resolveDailyLimits({ maxInvites: 2, maxJoins: 3 });
    assert.deepEqual(takeUpTo(['a', 'b', 'c', 'd'], lim.maxInvites), ['a', 'b']);
    assert.deepEqual(takeUpTo(['1', '2', '3', '4'], lim.maxJoins), ['1', '2', '3']);
  });

  it('OTP challenge URL is detected', () => {
    assert.equal(
      isOtpChallengeUrl('https://id.awin.com/u/mfa-otp-challenge?x=1'),
      true,
    );
    assert.equal(isOtpChallengeUrl('https://ui.awin.com/dashboard'), false);
  });

  it('folder upsert merges existing keys and preserves last* download state', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Bucket: 'a-affiliates',
      Key: 'awin/1001/',
      Body: Buffer.alloc(0),
      Metadata: {
        affiliateid: '1001',
        name: 'Old Name',
        awinmid: '1001',
        feedurl: 'https://example.invalid/feed.csv.gz',
        format: 'csv',
        compression: 'gzip',
        schedule: 'weekly',
        enabled: '1',
        lastdownload: '2026-10-01T00:00:00.000Z',
        laststatus: 'ok',
        lastsize: '99',
        customkeep: 'keep-me',
      },
    });

    const r = await upsertAwinAffiliateFolder({
      s3,
      bucket: 'a-affiliates',
      advertiserId: '1001',
      now: new Date('2026-10-18T12:00:00.000Z'),
      patch: {
        name: 'New Name',
        feedurl: 'https://example.invalid/feed.csv.gz',
        feedid: 'f1',
        enabled: '1',
      },
    });
    assert.equal(r.action, 'updated');
    const head = await s3.headObject({ Key: 'awin/1001/' });
    assert.equal(head.Metadata.name, 'New Name');
    assert.equal(head.Metadata.lastdownload, '2026-10-01T00:00:00.000Z');
    assert.equal(head.Metadata.laststatus, 'ok');
    assert.equal(head.Metadata.lastsize, '99');
    assert.equal(head.Metadata.customkeep, 'keep-me');
    // still a single folder key
    assert.equal(
      [...s3.objects.keys()].filter((k) => k.startsWith('awin/1001')).length,
      1,
    );
  });

  it('DryRun lists plan with no S3 writes and no Awin side effects', async () => {
    const s3 = createMemoryS3();
    let invites = 0;
    const out = [];
    const result = await runAwinAgent({
      dryRun: true,
      skipSignIn: true,
      s3,
      lockPath: path.join(tmp(), 'lock'),
      reportDir: path.join(tmp(), 'reports'),
      stdoutWrite: (s) => out.push(s),
      awin: {
        invite: async () => {
          invites += 1;
        },
        join: async () => {
          invites += 1;
        },
      },
      plan: {
        inviteIds: ['10', '11', '12'],
        joinIds: ['20'],
        approved: [
          {
            id: '30',
            name: 'Shop',
            feedurl: 'https://example.invalid/{feedapikey}/x',
            feedid: 'fid30',
          },
        ],
      },
      maxInvites: 2,
      maxJoins: 20,
      now: new Date('2026-10-18T15:00:00.000Z'),
    });
    assert.equal(result.ok, true);
    assert.equal(result.code, 'dry_run');
    assert.equal(invites, 0);
    assert.equal(s3.objects.size, 0);
    assert.deepEqual(result.report.invited, ['10', '11']);
    assert.deepEqual(result.report.foldersCreated, ['30']);
  });

  it('second concurrent run returns already_running exit-style result', async () => {
    const lockPath = path.join(tmp(), 'lock2');
    const held = acquireAwinAgentLock(lockPath, { now: () => 5_000_000 });
    assert.equal(held.ok, true);
    const out = [];
    const result = await runAwinAgent({
      dryRun: true,
      skipSignIn: true,
      lockPath,
      stdoutWrite: (s) => out.push(s),
      now: new Date('2026-10-18T15:00:00.000Z'),
    });
    assert.equal(result.code, 'already_running');
    assert.equal(result.ok, true);
    held.release();
  });

  it('OTP challenge stops and notifies Simon (no failure loop)', async () => {
    const secretPath = secretFile();
    const out = [];
    let gotos = 0;
    const result = await runAwinAgent({
      dryRun: true,
      secretPath,
      lockPath: path.join(tmp(), 'lock3'),
      reportDir: path.join(tmp(), 'reports'),
      stdoutWrite: (s) => out.push(s),
      browser: {
        async goto() {
          gotos += 1;
        },
        async currentUrl() {
          return 'https://id.awin.com/u/mfa-otp-challenge';
        },
      },
      now: new Date('2026-10-18T15:00:00.000Z'),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'otp_required');
    assert.equal(gotos, 1);
    assert.ok(result.report.notifySimon.some((x) => /otp_required/.test(x)));
    const blob = out.join('');
    assert.ok(!blob.includes(FAKE_PASSWORD));
  });

  it('secrets never appear in stdout or folder metadata', async () => {
    const secretPath = secretFile();
    const s3 = createMemoryS3();
    const out = [];
    const result = await runAwinAgent({
      dryRun: false,
      secretPath,
      s3,
      lockPath: path.join(tmp(), 'lock4'),
      reportDir: path.join(tmp(), 'reports'),
      stdoutWrite: (s) => out.push(s),
      skipSignIn: false,
      browser: {
        async goto() {},
        async currentUrl() {
          return 'https://ui.awin.com/dashboard';
        },
        async typeEmail() {},
        async typePasswordFromFile() {},
        async submit() {},
      },
      plan: {
        approved: [
          {
            id: '99',
            name: 'Ninetynine',
            feedurl: 'https://example.invalid/data/{feedapikey}/fid/99',
            feedid: '99',
          },
        ],
      },
      now: new Date('2026-10-18T16:00:00.000Z'),
    });
    assert.equal(result.ok, true);
    const blob = `${out.join('')}${JSON.stringify(result.report)}`;
    assertNoSecrets(blob, [FAKE_PASSWORD, FAKE_TOKEN]);
    const head = await s3.headObject({ Key: 'awin/99/' });
    assertNoSecrets(head.Metadata, [FAKE_PASSWORD, FAKE_TOKEN]);
    assert.ok(String(head.Metadata.feedurl).includes('{feedapikey}'));
  });

  it('readAwinSecretFile uses Merc two-line CRLF format (password = line 2 only)', () => {
    const p = secretFile();
    const c = readAwinSecretFile(p);
    assert.equal(c.email, FAKE_EMAIL);
    assert.equal(c.password, FAKE_PASSWORD);
  });

  it('docs + skill stubs exist for agent playbooks', () => {
    const root = path.join(__dirname, '..');
    const readme = path.join(root, 'redqueen', 'awin-agent', 'README.md');
    assert.ok(fs.existsSync(readme));
    const text = fs.readFileSync(readme, 'utf8');
    assert.match(text, /Grok first/i);
    assert.match(text, /Cursor/);
    assert.match(text, /awin\.secret\.txt/);
    assert.match(text, /-DryRun/);
    const affiliatesDocs = fs.readFileSync(
      path.join(root, 'docs', 'a-affiliates.md'),
      'utf8',
    );
    assert.match(affiliatesDocs, /awin-agent|FR #4123/);
    const skillsRoot = path.join(
      root,
      'redqueen',
      'awin-agent',
      '.grok',
      'skills',
    );
    for (const id of [
      'a-search-awin-agent-publisher-signin',
      'a-search-awin-agent-welcome-monitor',
      'a-search-awin-agent-feed-link-pulls',
      'a-search-awin-agent-merchant-feed-key',
      'a-search-awin-agent-daily-signups',
      'a-search-awin-agent-global-recommendations',
      'a-search-awin-agent-invite-metrics',
      'a-search-awin-agent-nofeed-followup',
      'a-search-awin-agent-merc-hostile-mrb',
    ]) {
      const skill = path.join(skillsRoot, id, 'SKILL.md');
      assert.ok(fs.existsSync(skill), skill);
      const body = fs.readFileSync(skill, 'utf8');
      assert.match(body, /CAST IRON/);
      assert.match(body, /SimonBarnett\/a-search/);
    }
  });
});
