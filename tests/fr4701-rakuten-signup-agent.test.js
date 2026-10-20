'use strict';

/**
 * FR #4701: Rakuten signup agent (provider-aware entry, Merc import, dedupe,
 * priority, records, notify, no SQL artefacts, secrets, lock, schedule script).
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createMemoryS3 } = require('../affiliates/src/memoryS3');
const {
  resolveProviderFromCwd,
} = require('../redqueen/affiliate-agent/src/cwd');
const {
  loadAffiliateAgentDocs,
  parseMessageCharLimit,
} = require('../redqueen/affiliate-agent/src/docs');
const {
  parseArgs,
  runAffiliateAgent,
  helpText,
} = require('../redqueen/affiliate-agent/src/run');
const { runRakutenAgent } = require('../redqueen/affiliate-agent/src/rakuten/run');
const {
  MERC_MANUAL_APPLICATIONS,
  mercRecord,
} = require('../redqueen/affiliate-agent/src/rakuten/mercImport');
const {
  importMercApplications,
  listApplicationRecords,
  PREFIX,
} = require('../redqueen/affiliate-agent/src/rakuten/records');
const { canReapply } = require('../redqueen/affiliate-agent/src/rakuten/dedupe');
const { sortByPriority } = require('../redqueen/affiliate-agent/src/rakuten/priority');
const {
  buildApplicationMessage,
} = require('../redqueen/affiliate-agent/src/rakuten/message');
const {
  readRakutenSecretFile,
  assertNoSecrets,
} = require('../redqueen/affiliate-agent/src/rakuten/secrets');
const {
  shouldIgnoreKey,
  matchFeedKey,
} = require('../redqueen/affiliate-import/src/listPending');

const ROOT = path.join(__dirname, '..');
const SEED = path.join(
  ROOT,
  'redqueen',
  'affiliate-agent',
  'seed',
  'a-affiliates',
);
const FAKE_PASSWORD = 'FAKE_rakuten_password_example_only';
const FAKE_EMAIL = 'fake.rakuten@example.invalid';

describe('FR #4701 rakuten signup agent', () => {
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
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4701-'));
    tmpDirs.push(d);
    return d;
  }

  function treeWithSeed() {
    const root = tmp();
    const aff = path.join(root, 'a-affiliates');
    fs.cpSync(SEED, aff, { recursive: true });
    return { root, aff, rakuten: path.join(aff, 'rakuten') };
  }

  function secretFile() {
    const dir = tmp();
    const p = path.join(dir, 'rakuten.secret.txt');
    fs.writeFileSync(p, `${FAKE_EMAIL}\r\n${FAKE_PASSWORD}\r\n`, 'utf8');
    return p;
  }

  it('cwd resolution: rakuten and awin ok; other rejected', () => {
    const { aff, rakuten } = treeWithSeed();
    const awin = path.join(aff, 'awin');
    fs.mkdirSync(awin, { recursive: true });
    const r = resolveProviderFromCwd(rakuten);
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'rakuten');
    const a = resolveProviderFromCwd(awin);
    assert.equal(a.ok, true);
    assert.equal(a.provider, 'awin');
    const bad = resolveProviderFromCwd(path.join(aff, 'impact'));
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 'unsupported_provider');
    const rootOnly = resolveProviderFromCwd(aff);
    assert.equal(rootOnly.ok, false);
  });

  it('load order: missing AGENTS.md / AGENT.md before sign-in', async () => {
    const root = tmp();
    const aff = path.join(root, 'a-affiliates');
    const rakuten = path.join(aff, 'rakuten');
    fs.mkdirSync(rakuten, { recursive: true });
    const missingRoot = loadAffiliateAgentDocs({
      affiliatesRoot: aff,
      provider: 'rakuten',
    });
    assert.equal(missingRoot.ok, false);
    assert.equal(missingRoot.code, 'missing_agents_md');

    fs.writeFileSync(path.join(aff, 'AGENTS.md'), '# root\n', 'utf8');
    const missingProv = loadAffiliateAgentDocs({
      affiliatesRoot: aff,
      provider: 'rakuten',
    });
    assert.equal(missingProv.ok, false);
    assert.equal(missingProv.code, 'missing_provider_agent_md');

    const { aff: seeded, rakuten: rk } = treeWithSeed();
    const out = [];
    const result = await runRakutenAgent({
      affiliatesRoot: seeded,
      providerRoot: rk,
      dryRun: true,
      skipSignIn: true,
      lockPath: path.join(tmp(), 'lock'),
      reportDir: path.join(tmp(), 'reports'),
      stdoutWrite: (s) => out.push(s),
    });
    assert.equal(result.ok, true);
  });

  it('Merc import: 10 pending merc-manual; Etsy mid 54054; second run no dup', async () => {
    const s3 = createMemoryS3();
    const rows = MERC_MANUAL_APPLICATIONS.map(mercRecord);
    assert.equal(rows.length, 10);
    const first = await importMercApplications({
      s3,
      bucket: 'a-affiliates',
      mercRows: rows,
    });
    assert.equal(first.written.length, 10);
    const listed = await listApplicationRecords({ s3, bucket: 'a-affiliates' });
    assert.equal(listed.length, 10);
    const etsy = listed.find((r) => String(r.metadata.mid) === '54054');
    assert.ok(etsy);
    assert.equal(etsy.metadata.status, 'pending');
    assert.equal(etsy.metadata.source, 'merc-manual');
    const second = await importMercApplications({
      s3,
      bucket: 'a-affiliates',
      mercRows: rows,
    });
    assert.equal(second.written.length, 0);
    assert.equal(second.skipped.length, 10);
    const again = await listApplicationRecords({ s3, bucket: 'a-affiliates' });
    assert.equal(again.length, 10);
  });

  it('dedupe: 89 days skip; 91 days declined eligible; pending/approved never', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    assert.equal(
      canReapply(
        {
          status: 'declined',
          appliedat: '2026-07-23T12:00:00Z', // 89 days
        },
        now,
      ).eligible,
      false,
    );
    assert.equal(
      canReapply(
        {
          status: 'declined',
          appliedat: '2026-07-21T12:00:00Z', // 91 days
        },
        now,
      ).eligible,
      true,
    );
    assert.equal(
      canReapply({ status: 'pending', appliedat: '2020-01-01T00:00:00Z' }, now)
        .eligible,
      false,
    );
    assert.equal(
      canReapply({ status: 'approved', appliedat: '2020-01-01T00:00:00Z' }, now)
        .eligible,
      false,
    );
  });

  it('record written after each apply; crash leaves N records', async () => {
    const { aff, rakuten } = treeWithSeed();
    const s3 = createMemoryS3();
    const result = await runRakutenAgent({
      affiliatesRoot: aff,
      providerRoot: rakuten,
      s3,
      skipSignIn: true,
      dryRun: false,
      lockPath: path.join(tmp(), 'lock'),
      reportDir: path.join(tmp(), 'reports'),
      maxApplications: 5,
      crashAfterApplications: 2,
      plan: {
        candidates: [
          { mid: '1', name: 'A' },
          { mid: '2', name: 'B' },
          { mid: '3', name: 'C' },
        ],
      },
      rakuten: { apply: async () => ({ ok: true }) },
      stdoutWrite: () => {},
    });
    assert.equal(result.code, 'simulated_crash');
    const listed = await listApplicationRecords({ s3, bucket: 'a-affiliates' });
    // Merc 10 + 2 applied before crash
    assert.equal(listed.length, 12);
  });

  it('priority: hobby/RC before general UK retail within cap', () => {
    const sorted = sortByPriority([
      { name: 'Tesco UK', mid: '9' },
      { name: 'Hobby RC Drone Shop', mid: '1' },
      { name: 'Argos', mid: '8' },
      { name: 'Model Flying Direct', mid: '2' },
    ]);
    assert.equal(sorted[0].mid, '1');
    assert.equal(sorted[1].mid, '2');
  });

  it('message guard uses AGENT.md char limit; unique per advertiser', () => {
    const { aff } = treeWithSeed();
    const docs = loadAffiliateAgentDocs({
      affiliatesRoot: aff,
      provider: 'rakuten',
    });
    assert.equal(docs.ok, true);
    const limit = parseMessageCharLimit(docs.texts.providerAgent);
    assert.equal(limit, 500);
    const a = buildApplicationMessage({ name: 'Alpha', mid: '11' }, limit);
    const b = buildApplicationMessage({ name: 'Beta', mid: '22' }, limit);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.notEqual(a.message, b.message);
    assert.ok(a.message.length <= limit);
    const over = buildApplicationMessage(
      { name: 'X'.repeat(600), mid: '99' },
      40,
    );
    assert.ok(over.ok === false || over.message.length <= 40);
  });

  it('approval Pending->Approved notifies once with /search MMFC; no repeat', async () => {
    const { aff, rakuten } = treeWithSeed();
    const s3 = createMemoryS3();
    const out = [];
    const first = await runRakutenAgent({
      affiliatesRoot: aff,
      providerRoot: rakuten,
      s3,
      skipSignIn: true,
      lockPath: path.join(tmp(), 'lock1'),
      reportDir: path.join(tmp(), 'r1'),
      plan: {
        statusChecks: [
          {
            mid: '54054',
            name: 'Etsy UK+IE',
            previousStatus: 'pending',
            status: 'approved',
          },
        ],
        candidates: [],
      },
      stdoutWrite: (s) => out.push(s),
    });
    assert.equal(first.report.partnershipsLive.length, 1);
    assert.equal(first.report.notifySimon.length, 1);
    assert.match(first.report.notifySimon[0], /\/search/);
    assert.match(first.report.notifySimon[0], /MMFC/);
    assert.match(first.report.notifySimon[0], /54054/);

    const second = await runRakutenAgent({
      affiliatesRoot: aff,
      providerRoot: rakuten,
      s3,
      skipSignIn: true,
      lockPath: path.join(tmp(), 'lock2'),
      reportDir: path.join(tmp(), 'r2'),
      plan: {
        statusChecks: [
          {
            mid: '54054',
            name: 'Etsy UK+IE',
            previousStatus: 'approved',
            status: 'approved',
          },
        ],
        candidates: [],
      },
      stdoutWrite: () => {},
    });
    assert.equal(second.report.partnershipsLive.length, 0);
    assert.equal(second.report.notifySimon.length, 0);
  });

  it('no SQL artefacts: only _applications + skills; listPending ignores', async () => {
    const { aff, rakuten } = treeWithSeed();
    const s3 = createMemoryS3();
    await runRakutenAgent({
      affiliatesRoot: aff,
      providerRoot: rakuten,
      s3,
      skipSignIn: true,
      lockPath: path.join(tmp(), 'lock'),
      reportDir: path.join(tmp(), 'reports'),
      plan: { candidates: [{ mid: '77', name: 'Hobby RC' }] },
      rakuten: { apply: async () => ({ ok: true }) },
      stdoutWrite: () => {},
    });
    const keys = [];
    const page = await s3.listObjectsV2({ Prefix: '' });
    for (const o of page.Contents || []) keys.push(o.Key);
    for (const k of keys) {
      assert.ok(k.startsWith(PREFIX), `unexpected key ${k}`);
      assert.ok(!/feedurl/i.test(k));
      assert.equal(shouldIgnoreKey(k), true);
      assert.equal(matchFeedKey(k), null);
    }
  });

  it('secrets never appear in stdout/report', async () => {
    const { aff, rakuten } = treeWithSeed();
    const secretPath = secretFile();
    const chunks = [];
    await runRakutenAgent({
      affiliatesRoot: aff,
      providerRoot: rakuten,
      secretPath,
      skipSignIn: false,
      browser: { signIn: async () => ({ ok: true }) },
      dryRun: true,
      lockPath: path.join(tmp(), 'lock'),
      reportDir: path.join(tmp(), 'reports'),
      plan: { candidates: [] },
      stdoutWrite: (s) => chunks.push(s),
    });
    const blob = chunks.join('');
    assertNoSecrets(blob, [FAKE_PASSWORD, FAKE_EMAIL]);
  });

  it('captcha / sign-in failure stops and notifies Simon', async () => {
    const { aff, rakuten } = treeWithSeed();
    const secretPath = secretFile();
    const result = await runRakutenAgent({
      affiliatesRoot: aff,
      providerRoot: rakuten,
      secretPath,
      browser: {
        signIn: async () => ({ ok: false, code: 'captcha', detail: 'blocked' }),
      },
      lockPath: path.join(tmp(), 'lock'),
      reportDir: path.join(tmp(), 'reports'),
      stdoutWrite: () => {},
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'captcha');
    assert.ok(result.report.notifySimon.some((n) => /captcha/i.test(n)));
  });

  it('lock: second concurrent run already_running exit 0', async () => {
    const { aff, rakuten } = treeWithSeed();
    const lockPath = path.join(tmp(), 'shared.lock');
    const first = await runRakutenAgent({
      affiliatesRoot: aff,
      providerRoot: rakuten,
      skipSignIn: true,
      dryRun: true,
      lockPath,
      reportDir: path.join(tmp(), 'r1'),
      stdoutWrite: () => {},
      // hold lock by not releasing — run completes and releases; use acquire directly
    });
    assert.ok(first.ok);
    const { acquireAwinAgentLock } = require('../redqueen/awin-agent/src/lock');
    const held = acquireAwinAgentLock(lockPath, { now: () => 1_000_000 });
    assert.equal(held.ok, true);
    const second = await runRakutenAgent({
      affiliatesRoot: aff,
      providerRoot: rakuten,
      skipSignIn: true,
      dryRun: true,
      lockPath,
      reportDir: path.join(tmp(), 'r2'),
      stdoutWrite: () => {},
    });
    assert.equal(second.code, 'already_running');
    held.release();
  });

  it('parseArgs / help list rakuten; schedule script leaves awin task name distinct', () => {
    assert.equal(parseArgs(['-DryRun']).dryRun, true);
    assert.match(helpText(), /rakuten/i);
    assert.match(helpText(), /awin/i);
    const ps1 = fs.readFileSync(
      path.join(
        ROOT,
        'redqueen',
        'affiliate-agent',
        'install',
        'Register-AffiliateAgentTask.ps1',
      ),
      'utf8',
    );
    assert.match(ps1, /a-search-rakuten-agent/);
    assert.match(ps1, /a-search-awin-agent/);
    assert.match(ps1, /ValidateSet\('awin',\s*'rakuten'\)/);
    const agentPs1 = fs.readFileSync(
      path.join(ROOT, 'tools', 'agent.ps1'),
      'utf8',
    );
    assert.match(agentPs1, /rakuten/i);
  });

  it('runAffiliateAgent dispatches rakuten from cwd', async () => {
    const { rakuten, aff } = treeWithSeed();
    const result = await runAffiliateAgent({
      cwd: rakuten,
      dryRun: true,
      skipSignIn: true,
      affiliatesRoot: aff,
      providerRoot: rakuten,
      lockPath: path.join(tmp(), 'lock'),
      reportDir: path.join(tmp(), 'reports'),
      stdoutWrite: () => {},
    });
    // runAffiliateAgent passes opts through; rakuten path needs affiliatesRoot from resolve
    assert.ok(result.ok || result.code === 'dry_run' || result.report);
  });
});
