'use strict';

/**
 * FR #5066: CJ invite — Advertiser Lookup XML, 403 clean stop, rank, pacing,
 * dispatcher registry, docs, Awin regression pins.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const INVITE_PS1 = path.join(ROOT, 'tools', 'invite.ps1');
const LOOKUP = path.join(ROOT, 'redqueen', 'cj-invite', 'lib', 'advertiserLookup.js');
const RANK = path.join(ROOT, 'redqueen', 'cj-invite', 'lib', 'rank.js');
const RUN = path.join(ROOT, 'redqueen', 'cj-invite', 'lib', 'runInvite.js');
const SECRETS = path.join(ROOT, 'redqueen', 'cj-invite', 'lib', 'secrets.js');

const SAMPLE_XML = `<?xml version="1.0"?>
<cj-api>
  <advertisers>
    <advertiser>
      <advertiser-id>111</advertiser-id>
      <advertiser-name>RC Hobby World</advertiser-name>
      <relationship-status>notjoined</relationship-status>
      <account-status>active</account-status>
      <network-rank>80</network-rank>
      <seven-day-epc>1.2</seven-day-epc>
      <three-month-epc>2.5</three-month-epc>
      <primary-category>Hobbies</primary-category>
      <link-types>Product Feed</link-types>
    </advertiser>
    <advertiser>
      <advertiser-id>222</advertiser-id>
      <advertiser-name>Socks Emporium</advertiser-name>
      <relationship-status>notjoined</relationship-status>
      <network-rank>10</network-rank>
      <three-month-epc>0.1</three-month-epc>
      <primary-category>Apparel</primary-category>
    </advertiser>
    <advertiser>
      <advertiser-id>333</advertiser-id>
      <advertiser-name>Already Joined Co</advertiser-name>
      <relationship-status>joined</relationship-status>
      <network-rank>99</network-rank>
      <primary-category>Hobbies</primary-category>
    </advertiser>
  </advertisers>
</cj-api>`;

describe('FR #5066 CJ invite', () => {
  /** @type {string} */
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr5066-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('parseAdvertiserLookupXml extracts ids and relationship', async () => {
    const { parseAdvertiserLookupXml, filterByRelationship } = await import(
      pathToFileUrl(LOOKUP)
    );
    const rows = parseAdvertiserLookupXml(SAMPLE_XML);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].id, '111');
    assert.equal(rows[0].name, 'RC Hobby World');
    assert.equal(rows[0].relationshipStatus, 'notjoined');
    assert.equal(rows[0].hasFeed, true);
    const nj = filterByRelationship(rows, 'notjoined');
    assert.deepEqual(
      nj.map((r) => r.id),
      ['111', '222'],
    );
  });

  it('403 from lookup throws cj_account_not_active', async () => {
    const { fetchAdvertiserLookupPage, CjAccountNotActiveError } = await import(
      pathToFileUrl(LOOKUP)
    );
    await assert.rejects(
      () =>
        fetchAdvertiserLookupPage(
          { 'requestor-cid': '8103947', 'advertiser-ids': 'notjoined' },
          'FAKE_TOKEN_NOT_REAL',
          {
            fetchFn: async () => ({
              status: 403,
              ok: false,
              text: async () => 'You are not Authorised',
            }),
          },
        ),
      (err) => err instanceof CjAccountNotActiveError && err.code === 'cj_account_not_active',
    );
  });

  it('listAdvertisers paces between pages under 25/min floor', async () => {
    const { listAdvertisers, MAX_RECORDS_PER_PAGE, MIN_INTERVAL_MS } = await import(
      pathToFileUrl(LOOKUP)
    );
    assert.equal(MAX_RECORDS_PER_PAGE, 100);
    assert.ok(MIN_INTERVAL_MS >= 2400);
    /** @type {number[]} */
    const sleeps = [];
    let page = 0;
    const rows = await listAdvertisers({
      token: 'FAKE_TOKEN_NOT_REAL',
      requestorCid: '8103947',
      maxPages: 2,
      sleepFn: async (ms) => {
        sleeps.push(ms);
      },
      fetchFn: async () => {
        page += 1;
        // Full page then short page to stop
        const n = page === 1 ? MAX_RECORDS_PER_PAGE : 1;
        const body = Array.from({ length: n }, (_, i) => {
          const id = page * 1000 + i;
          return `<advertiser><advertiser-id>${id}</advertiser-id><advertiser-name>A${id}</advertiser-name><relationship-status>notjoined</relationship-status></advertiser>`;
        }).join('');
        return {
          status: 200,
          ok: true,
          text: async () => `<advertisers>${body}</advertisers>`,
        };
      },
    });
    assert.ok(rows.length > MAX_RECORDS_PER_PAGE);
    assert.ok(sleeps.length >= 1);
    assert.ok(sleeps[0] <= MIN_INTERVAL_MS);
  });

  it('rankCjAdvertisers prefers hobby category then rank', async () => {
    const { rankCjAdvertisers } = await import(pathToFileUrl(RANK));
    const ranked = rankCjAdvertisers([
      { id: '2', primaryCategory: 'Apparel', networkRank: 99, epc3Month: 9 },
      { id: '1', primaryCategory: 'Hobbies', networkRank: 50, epc3Month: 1 },
    ]);
    assert.equal(ranked[0].id, '1');
  });

  it('runCjInvite dry-run lists ranked notjoined; no marker writes', async () => {
    const { runCjInvite, EXIT_OK } = await import(pathToFileUrl(RUN));
    const reportDir = path.join(tmp, 'reports');
    const lockPath = path.join(tmp, 'cj-invite.lock');
    const affiliatesRoot = path.join(tmp, 'cj');
    fs.mkdirSync(affiliatesRoot, { recursive: true });
    let markerWrites = 0;
    const out = await runCjInvite({
      live: false,
      max: 3,
      token: 'FAKE_TOKEN_NOT_REAL',
      companyId: '8103947',
      reportDir,
      lockPath,
      affiliatesRoot,
      sleepFn: async () => {},
      fetchFn: async () => ({
        status: 200,
        ok: true,
        text: async () => SAMPLE_XML,
      }),
      writeMarkerFn: async () => {
        markerWrites += 1;
      },
      log: () => {},
    });
    assert.equal(out.code, EXIT_OK);
    assert.equal(markerWrites, 0);
    assert.ok(out.report.counts.candidates >= 1);
    assert.equal(out.report.advertisers[0].id, '111');
    assert.match(out.report.advertisers[0].message, /RC Hobby|Club Madeira|Hobbies/i);
    const day = out.report.at.slice(0, 10);
    assert.ok(fs.existsSync(path.join(reportDir, `${day}.json`)));
  });

  it('runCjInvite 403 => exit 5, no records', async () => {
    const { runCjInvite, EXIT_ACCOUNT_NOT_ACTIVE } = await import(pathToFileUrl(RUN));
    const reportDir = path.join(tmp, 'reports403');
    const lockPath = path.join(tmp, 'lock403');
    const affiliatesRoot = path.join(tmp, 'cj403');
    fs.mkdirSync(affiliatesRoot, { recursive: true });
    let markers = 0;
    const out = await runCjInvite({
      live: false,
      max: 3,
      token: 'FAKE_TOKEN_NOT_REAL',
      reportDir,
      lockPath,
      affiliatesRoot,
      fetchFn: async () => ({
        status: 403,
        ok: false,
        text: async () => 'You are not Authorised',
      }),
      writeMarkerFn: async () => {
        markers += 1;
      },
      log: () => {},
    });
    assert.equal(out.code, EXIT_ACCOUNT_NOT_ACTIVE);
    assert.equal(out.report.error, 'cj_account_not_active');
    assert.equal(markers, 0);
  });

  it('live apply writes marker after success; captcha stops', async () => {
    const { runCjInvite, EXIT_OK, EXIT_NEEDS_OTP } = await import(pathToFileUrl(RUN));
    const reportDir = path.join(tmp, 'live');
    const lockPath = path.join(tmp, 'lock-live');
    const affiliatesRoot = path.join(tmp, 'cj-live');
    fs.mkdirSync(affiliatesRoot, { recursive: true });
    /** @type {string[]} */
    const wrote = [];
    const ok = await runCjInvite({
      live: true,
      max: 1,
      token: 'FAKE_TOKEN_NOT_REAL',
      reportDir,
      lockPath,
      affiliatesRoot,
      sleepFn: async () => {},
      fetchFn: async () => ({
        status: 200,
        ok: true,
        text: async () => SAMPLE_XML,
      }),
      applyFn: async () => {},
      writeMarkerFn: async (o) => {
        wrote.push(String(o.id));
        return {};
      },
      log: () => {},
    });
    assert.equal(ok.code, EXIT_OK);
    assert.deepEqual(wrote, ['111']);

    const captcha = await runCjInvite({
      live: true,
      max: 1,
      token: 'FAKE_TOKEN_NOT_REAL',
      reportDir: path.join(tmp, 'cap'),
      lockPath: path.join(tmp, 'lock-cap'),
      affiliatesRoot,
      sleepFn: async () => {},
      fetchFn: async () => ({
        status: 200,
        ok: true,
        text: async () => SAMPLE_XML,
      }),
      applyFn: async () => {
        throw new Error('captcha challenge');
      },
      writeMarkerFn: async () => {},
      log: () => {},
    });
    assert.equal(captcha.code, EXIT_NEEDS_OTP);
  });

  it('redactSecrets strips bearer and jwt-shaped tokens', async () => {
    const { redactSecrets } = await import(pathToFileUrl(SECRETS));
    // Assemble JWT-shaped fixture at runtime (FR #3304 / a-search#611) --- never
    // a contiguous eyJ... literal in source (GitGuardian).
    const fake = require('./fixtures/fakeSecrets');
    const jwt = fake.fakeDummyJwt();
    const s = redactSecrets(
      ['Authorization ', 'Bearer ', jwt, ' token=', 'abc', ' password=', 'x'].join(''),
    );
    assert.doesNotMatch(s, /eyJ/);
    assert.match(s, /\*\*\*/);
  });

  it('loadCjSecretFile reads lines 4 and 5', async () => {
    const { loadCjSecretFile } = await import(pathToFileUrl(SECRETS));
    const f = path.join(tmp, 'cj.secret.txt');
    fs.writeFileSync(f, 'u\np\nemail\nFAKE_PAT_LINE\n101908183\n', 'utf8');
    const loaded = loadCjSecretFile(f);
    assert.equal(loaded.token, 'FAKE_PAT_LINE');
    assert.equal(loaded.websiteId, '101908183');
  });

  it('invite.ps1 registers cj alongside awin+rakuten; runFromAgentRoot', () => {
    const ps1 = fs.readFileSync(INVITE_PS1, 'utf8');
    assert.match(ps1, /InviteProviders\s*=\s*@\('awin',\s*'rakuten',\s*'cj'\)/);
    assert.match(ps1, /runFromAgentRoot/);
    assert.match(ps1, /CJ_SECRET_FILE/);
    assert.match(ps1, /function Invoke-CjInvite/);
    assert.match(ps1, /function Invoke-RakutenInvite/);
    assert.match(ps1, /'awin'/);
  });

  it('docs and seed AGENT.md cover CJ invite flow', () => {
    const tools = fs.readFileSync(
      path.join(ROOT, 'tools', 'README-folder-tools.md'),
      'utf8',
    );
    assert.match(tools, /FR #5066|#5066/);
    assert.match(tools, /\bcj\b/i);
    assert.match(tools, /cj_account_not_active|exit 5/i);
    const agent = fs.readFileSync(
      path.join(
        ROOT,
        'redqueen',
        'affiliate-agent',
        'seed',
        'a-affiliates',
        'cj',
        'AGENT.md',
      ),
      'utf8',
    );
    assert.match(agent, /500/);
    assert.match(agent, /Advertiser Lookup/i);
    assert.match(agent, /Account Manager/i);
    assert.match(agent, /enabled=0/);
    assert.equal(agent.charCodeAt(0) === 0xfeff, false);
    const cfg = JSON.parse(
      fs.readFileSync(
        path.join(
          ROOT,
          'redqueen',
          'affiliate-agent',
          'seed',
          'a-affiliates',
          'cj',
          '_invite',
          'config.json',
        ),
        'utf8',
      ),
    );
    assert.equal(cfg.runFromAgentRoot, true);
    assert.equal(cfg.companyId, '8103947');
  });

  it('Awin invite-core still exports cooldown helpers (regression)', async () => {
    const core = await import(
      pathToFileUrl(
        path.join(ROOT, 'redqueen', 'awin-agent', 'scripts', 'lib', 'invite-core.mjs'),
      )
    );
    assert.equal(core.MAX_MSG, 149);
    assert.equal(core.DEFAULT_COOLDOWN_DAYS, 90);
    assert.equal(typeof core.classifySkip, 'function');
    assert.equal(typeof core.writeInviteMarkerAws, 'function');
  });
});

/**
 * @param {string} p
 */
function pathToFileUrl(p) {
  const abs = path.resolve(p);
  const u = new URL('file:///');
  u.pathname = abs.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:');
  return u.href;
}
