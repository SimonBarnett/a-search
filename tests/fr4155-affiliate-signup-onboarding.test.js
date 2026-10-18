'use strict';

/**
 * FR #4155: publisher-signup onboarding skills for non-Awin affiliates
 * (from a-affiliates AGENT.md paste). No UNKNOWN for account signup;
 * no secret literals; deep-link params match networkParams.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  NETWORK_PARAMS,
} = require('../shared/links/networkParams');

const ROOT = path.join(__dirname, '..');

const PROVIDERS = [
  {
    id: 'impact',
    signupUrl: 'https://app.impact.com/signup',
    hold: false,
  },
  {
    id: 'partnerize',
    signupUrl: 'https://join.partnerize.com/partnerize',
    hold: false,
  },
  {
    id: 'webgains',
    signupUrl: 'https://platform.webgains.io/publisher/sign-up',
    hold: false,
  },
  {
    id: 'tradedoubler',
    signupUrl: 'https://publishers.tradedoubler.com/en/publishers/signup/',
    hold: false,
  },
  {
    id: 'admitad',
    signupUrl: 'https://www.admitad.com/en/webmaster/',
    hold: true,
  },
  {
    id: 'flexoffers',
    signupUrl: 'https://www.flexoffers.com/affiliates/',
    hold: true,
  },
  {
    id: 'avantlink',
    signupUrl: 'https://www.avantlink.com/affiliates/',
    hold: true,
  },
];

function skillPath(id) {
  return path.join(
    ROOT,
    'providers',
    'local',
    id,
    '.grok',
    'skills',
    `a-search-${id}-onboarding`,
    'SKILL.md',
  );
}

function readSkill(id) {
  return fs.readFileSync(skillPath(id), 'utf8');
}

describe('FR #4155 affiliate publisher-signup onboarding skills', () => {
  for (const p of PROVIDERS) {
    it(`${p.id}: skill exists, no account-signup UNKNOWN, has signup URL`, () => {
      const raw = fs.readFileSync(skillPath(p.id));
      assert.notEqual(raw[0], 0xef, 'UTF-8 no BOM');
      assert.equal(raw.includes(0x07), false, 'no BEL corruption');
      const text = raw.toString('utf8');
      assert.match(text, new RegExp(`^name:\\s*a-search-${p.id}-onboarding`, 'm'));
      assert.match(text, /CAST IRON harvest/);
      assert.doesNotMatch(text, /is\s+\*\*UNKNOWN\*\*/);
      assert.doesNotMatch(text, /Full agent-led onboarding[^\n]*\*\*UNKNOWN\*\*/);
      assert.ok(text.includes(p.signupUrl) || text.includes(p.signupUrl.replace(/\?.*$/, '')), 'signup URL');
      assert.match(text, /message limit:\s*UNKNOWN/i);
      assert.match(text, /C:\\passwords\\/);
      if (p.hold) {
        assert.match(text, /HOLD|Do not sign up/i);
      }
      if (p.id === 'impact') {
        assert.match(text, /superseded by `?a-affiliates`?/i);
        assert.match(text, /ImpactPendingOnboard|MSSQL/);
      }
    });
  }

  it('skills contain no hunter-style secret literals', () => {
    for (const p of PROVIDERS) {
      const text = readSkill(p.id);
      assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./);
      assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9._-]{16,}/i);
      assert.doesNotMatch(text, /password\s*=\s*['\"][^'\"]{8,}/i);
      assert.doesNotMatch(text, /\bAKIA[0-9A-Z]{16}\b/);
    }
  });

  it('deep-link / affiliate params align with networkParams.js', () => {
    assert.equal(NETWORK_PARAMS.impact.tenantParam, 'subId1');
    assert.equal(NETWORK_PARAMS.partnerize.affiliateParam, 'camref');
    assert.equal(NETWORK_PARAMS.partnerize.tenantParam, 'pubref');
    assert.equal(NETWORK_PARAMS.webgains.affiliateParam, 'wgcampaignid');
    assert.equal(NETWORK_PARAMS.webgains.tenantParam, 'clickref');
    assert.equal(NETWORK_PARAMS.tradedoubler.affiliateParam, 'a');
    assert.equal(NETWORK_PARAMS.tradedoubler.tenantParam, 'epi');
    assert.equal(NETWORK_PARAMS.admitad.affiliateParam, 'admitad_uid');
    assert.equal(NETWORK_PARAMS.admitad.tenantParam, 'subid');
    assert.match(NETWORK_PARAMS.admitad.notes || '', /subid3/);
    assert.equal(NETWORK_PARAMS.flexoffers.affiliateParam, 'foid');
    assert.equal(NETWORK_PARAMS.flexoffers.tenantParam, 'fobs');
    assert.equal(NETWORK_PARAMS.avantlink.affiliateParam, 'pw');
    assert.equal(NETWORK_PARAMS.avantlink.tenantParam, 'ctc');

    const impact = readSkill('impact');
    assert.match(impact, /subId1/);
    assert.match(impact, /mediapartnerid/);
    const pz = readSkill('partnerize');
    assert.match(pz, /camref/);
    assert.match(pz, /pubref/);
    const wg = readSkill('webgains');
    assert.match(wg, /wgcampaignid|clickref/);
    const td = readSkill('tradedoubler');
    assert.match(td, /ouraffiliateid|epi/);
    const ad = readSkill('admitad');
    assert.match(ad, /admitad_uid|subid/);
    assert.match(ad, /subid3/);
    const fo = readSkill('flexoffers');
    assert.match(fo, /foid|fobs/);
    const av = readSkill('avantlink');
    assert.match(av, /\bpw\b|\bctc\b/);
  });
});
