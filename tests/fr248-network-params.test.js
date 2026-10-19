'use strict';

/**
 * FR-248 / #1362: network params, taxonomy, bug pins, merchant unstamp, /go tenant.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-248.md');

const {
  NETWORK_PARAMS,
  getSourceClass,
  DEFAULT_ACCOUNT_QUERY_MAP,
} = require('../shared/links/networkParams');
const { buildOutboundUrl } = require('../shared/links/buildOutboundUrl');
const { buildTrackedUrl } = require('../shared/links/buildTrackedUrl');
const { isPartner, parsePermissions } = require('../shared/partners/isPartner');
const {
  resolveAmazonTag,
  shouldAlertAmazonTagLimit,
} = require('../shared/links/amazonTag');
const { defaultStampUrl } = require('../shared/widgets/go');

describe('FR-248 network params', () => {
  it('Decision LOCKED docs ASCII + tracked-links taxonomy', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-248.md must be ASCII');
    const fr = buf.toString('utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /subId1/);
    assert.match(fr, /isPartner/);
    assert.match(fr, /AmazonTrackingIds/);
    assert.match(fr, /FR-251|a_search/);
    const docs = fs.readFileSync(
      path.join(ROOT, 'docs', 'tracked-links.md'),
      'utf8',
    );
    assert.match(docs, /FR-248/);
    assert.match(docs, /affiliate \| merchant \| provider|class.*affiliate/i);
    assert.match(docs, /clickref/);
  });

  it('registry: every entry has class; live->provider; merchants merchantConnect', () => {
    const reg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'providers', 'registry.json'), 'utf8'),
    );
    for (const s of reg.sources) {
      assert.ok(s.class, `missing class on ${s.id}`);
      assert.ok(
        ['affiliate', 'merchant', 'provider'].includes(s.class),
        `${s.id} bad class ${s.class}`,
      );
      if (s.kind === 'live') assert.equal(s.class, 'provider', s.id);
      if (s.class === 'merchant') {
        assert.equal(s.merchantConnect, true, s.id);
      }
      assert.equal(getSourceClass(s.id), s.class, s.id);
    }
  });

  it('bug pins: impact campaign not subId1; rakuten id; cj sid=tenant', () => {
    assert.equal(DEFAULT_ACCOUNT_QUERY_MAP.IMPACT_CAMPAIGN_ID, undefined);
    assert.equal(DEFAULT_ACCOUNT_QUERY_MAP.RAKUTEN_SITE_ID, 'id');
    assert.notEqual(DEFAULT_ACCOUNT_QUERY_MAP.RAKUTEN_SITE_ID, 'mid');
    assert.equal(DEFAULT_ACCOUNT_QUERY_MAP.CJ_WEBSITE_ID, undefined);

    const impact = buildOutboundUrl('impact', {
      url: 'https://shop.example.com/p/1',
      tenantId: 'ABCD1234',
      envVars: {
        IMPACT_MEDIA_PARTNER_ID: 'mp1',
        IMPACT_CAMPAIGN_ID: 'camp99',
        IMPACT_AD_ID: 'ad1',
        IMPACT_TRACKING_HOST: 'go.sjv.io',
      },
    });
    assert.match(impact, /\/c\/mp1\/ad1\/camp99/);
    assert.match(impact, /subId1=ABCD1234/);
    assert.doesNotMatch(impact, /subId1=camp99/);

    const rakuten = buildOutboundUrl('rakuten', {
      url: 'https://www.example.com/rk/1',
      tenantId: 'TENANT01',
      envVars: { RAKUTEN_SITE_ID: 'pub-7', RAKUTEN_MID: 'adv-9' },
    });
    assert.match(rakuten, /[?&]id=pub-7/);
    assert.match(rakuten, /[?&]mid=adv-9/);
    assert.match(rakuten, /[?&]u1=TENANT01/);
    assert.doesNotMatch(rakuten, /[?&]mid=pub-7/);

    const cj = buildOutboundUrl('cj', {
      url: 'https://www.anrdoezrs.net/click-111-222?url=https%3A%2F%2Fex.com',
      tenantId: 'CLUB0001',
      envVars: { CJ_WEBSITE_ID: '99999' },
    });
    assert.match(cj, /[?&]sid=CLUB0001/);
    assert.doesNotMatch(cj, /[?&]sid=99999/);
  });

  it('fixture URL per source -> expected tenant/affiliate params; merchant unchanged', () => {
    const cases = [
      {
        source: 'awin',
        url: 'https://www.awin1.com/cread.php?awinmid=1&ued=https%3A%2F%2Fx.com',
        env: { AWIN_PUBLISHER_ID: 'pubA', AWIN_ADVERTISER_ID: '1' },
        expect: [/awinaffid=pubA/, /clickref=TENANT01/],
      },
      {
        source: 'ebay',
        url: 'https://www.ebay.co.uk/itm/1',
        env: { EBAY_CAMPAIGN_ID: '5338' },
        expect: [/campid=5338/, /customid=TENANT01/, /mkcid=1/],
      },
      {
        source: 'flexoffers',
        url: 'https://track.flexoffers.com/a.ashx?foid=1&url=https%3A%2F%2Fx.com',
        env: { FLEXOFFERS_AFFILIATE_ID: 'fo1' },
        expect: [/foid=fo1/, /fobs=TENANT01/],
      },
      {
        source: 'skimlinks',
        url: 'https://go.skimresources.com/?id=1&url=https%3A%2F%2Fx.com',
        env: { SKIMLINKS_PUBLISHER_ID: 'sk1' },
        expect: [/[?&]id=sk1/, /xcust=TENANT01/],
      },
    ];
    for (const c of cases) {
      const out = buildOutboundUrl(c.source, {
        url: c.url,
        tenantId: 'TENANT01',
        envVars: c.env,
      });
      for (const re of c.expect) assert.match(out, re, c.source);
    }

    const plain = 'https://demo.myshopify.com/products/mug';
    assert.equal(
      buildOutboundUrl('shopify', { url: plain, tenantId: 'X' }),
      plain,
    );
    assert.equal(
      buildOutboundUrl('wix', { url: plain, tenantId: 'X' }),
      plain,
    );
    assert.equal(
      buildOutboundUrl('woocommerce', { url: plain, tenantId: 'X' }),
      plain,
    );
  });

  it('partnerId slot only when isPartner; clickId when slot exists', () => {
    assert.equal(isPartner({ permissions: "['partner','admin']" }), true);
    assert.equal(isPartner({ permissions: "['community']" }), false);
    assert.equal(isPartner({ role: 'partner', permissions: '[]' }), false);
    assert.deepEqual(parsePermissions("['partner']"), ['partner']);

    const withPartner = buildOutboundUrl('awin', {
      url: 'https://www.awin1.com/cread.php?ued=https%3A%2F%2Fx.com',
      tenantId: 'TENANT01',
      partnerId: 'PARTN001',
      partnerUser: { permissions: "['partner']" },
      clickId: 'clk_abc',
      envVars: { AWIN_PUBLISHER_ID: 'pubA' },
    });
    assert.match(withPartner, /clickref2=PARTN001/);
    assert.match(withPartner, /clickref3=clk_abc/);

    const noPartner = buildOutboundUrl('awin', {
      url: 'https://www.awin1.com/cread.php?ued=https%3A%2F%2Fx.com',
      tenantId: 'TENANT01',
      partnerId: 'PARTN001',
      partnerUser: { permissions: "['community']" },
      envVars: { AWIN_PUBLISHER_ID: 'pubA' },
    });
    assert.doesNotMatch(noPartner, /clickref2=/);
  });

  it('Amazon upgraded club tag vs base; alert at 50', () => {
    const base = resolveAmazonTag({
      tenantId: 'ABCD1234',
      baseTag: 'mymodelflying-21',
      upgraded: false,
    });
    assert.equal(base.tag, 'mymodelflying-21');

    const logs = [];
    const missing = resolveAmazonTag({
      tenantId: 'ABCD1234',
      baseTag: 'mymodelflying-21',
      upgraded: true,
      provisionedTags: [],
      log: (code) => logs.push(code),
    });
    assert.equal(missing.tag, 'mymodelflying-21');
    assert.equal(missing.missing, true);
    assert.deepEqual(logs, ['amazon_tag_missing']);

    const ok = resolveAmazonTag({
      tenantId: 'ABCD1234',
      baseTag: 'mymodelflying-21',
      upgraded: true,
      provisionedTags: ['mymodelflying-abcd1234-21'],
    });
    assert.equal(ok.tag, 'mymodelflying-abcd1234-21');
    assert.equal(shouldAlertAmazonTagLimit({ count: 50 }), true);
    assert.equal(
      shouldAlertAmazonTagLimit({ count: 50, alreadyAlerted: true }),
      false,
    );
  });

  it('/go defaultStampUrl: different clubIds -> different tenant slots; merchant plain', () => {
    const part = {
      url: 'https://www.awin1.com/cread.php?ued=https%3A%2F%2Fx.com',
      source: 'awin',
      class: 'affiliate',
    };
    const a = defaultStampUrl({
      part,
      customer: { clubId: 'CLUBAAA1' },
      clickId: 'clk1',
      env: 'sandbox',
      envMap: { AWIN_PUBLISHER_ID: 'pubA' },
    });
    const b = defaultStampUrl({
      part,
      customer: { clubId: 'CLUBBBB2' },
      clickId: 'clk2',
      env: 'sandbox',
      envMap: { AWIN_PUBLISHER_ID: 'pubA' },
    });
    assert.match(a, /clickref=CLUBAAA1/);
    assert.match(b, /clickref=CLUBBBB2/);
    assert.notEqual(a, b);

    const merchantUrl = 'https://shop.example.com/products/mug';
    assert.equal(
      defaultStampUrl({
        part: { url: merchantUrl, source: 'shopify', class: 'merchant' },
        customer: { clubId: 'CLUBAAA1' },
        clickId: 'clk1',
        env: 'sandbox',
      }),
      merchantUrl,
    );
  });

  it('wix/woocommerce workers have no AFFILIATE_ID sid stamp', () => {
    const wix = fs.readFileSync(
      path.join(ROOT, 'providers', 'local', 'wix', 'src', 'worker.js'),
      'utf8',
    );
    const woo = fs.readFileSync(
      path.join(ROOT, 'providers', 'local', 'woocommerce', 'src', 'worker.js'),
      'utf8',
    );
    assert.doesNotMatch(wix, /WIX_AFFILIATE_ID/);
    assert.doesNotMatch(wix, /buildTrackedUrl\(/);
    assert.doesNotMatch(woo, /WOOCOMMERCE_AFFILIATE_ID/);
    assert.doesNotMatch(woo, /buildTrackedUrl\(/);
    const wixEnv = fs.readFileSync(
      path.join(ROOT, 'providers', 'local', 'wix', '.env.example'),
      'utf8',
    );
    const wooEnv = fs.readFileSync(
      path.join(ROOT, 'providers', 'local', 'woocommerce', '.env.example'),
      'utf8',
    );
    assert.doesNotMatch(wixEnv, /WIX_AFFILIATE_ID/);
    assert.doesNotMatch(wooEnv, /WOOCOMMERCE_AFFILIATE_ID/);
  });

  it('buildTrackedUrl source delegates; migration AmazonTrackingIds present', () => {
    const out = buildTrackedUrl({
      url: 'https://www.example.com/p',
      userId: 'USER0001',
      source: 'avantlink',
      envVars: { AVANTLINK_AFFILIATE_ID: 'pw1' },
    });
    assert.match(out, /pw=pw1/);
    assert.match(out, /ctc=USER0001/);
    const mig = fs.readFileSync(
      path.join(ROOT, 'db', 'migrations', '015_AmazonTrackingIds.sql'),
      'utf8',
    );
    assert.match(mig, /AmazonTrackingIds/);
    assert.match(mig, /a_search/);
  });
});
