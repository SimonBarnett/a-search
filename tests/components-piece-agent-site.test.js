'use strict';

/**
 * FR-204 / #1192: Agent site pass writes site.md + seeds top10.json.
 * Fail-when: skips site.md or writes secrets.
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { hostDir } = require('../shared/widgets/widgetPath');
const { bootstrapHost } = require('../shared/widgets/bootstrap');
const {
  customerCwd,
  buildSiteMd,
  runSitePass,
  onTreeEvent,
  assertNoSecrets,
} = require('../shared/widgets/agentSitePass');

describe('FR-204 ComponentsPiece agent site pass', () => {
  /** @type {string} */
  let root;
  const env = 'sandbox';
  const customerNumber = '42';
  const host = 'shop.example';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a-search-fr204-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('customerCwd is {root}/{env}/x/{customerNumber}', () => {
    const cwd = customerCwd({ root, env, customerNumber });
    assert.equal(cwd, path.join(root, env, 'x', customerNumber));
    assert.equal(hostDir(env, customerNumber), `${env}/x/${customerNumber}`);
  });

  it('buildSiteMd has host skillbook and no secrets', () => {
    const md = buildSiteMd({ host, customerNumber, env });
    assert.match(md, /# Site skillbook/);
    assert.match(md, new RegExp(`host: ${host}`));
    assert.match(md, /affiliate/i);
    assert.match(md, /Do not put secrets/i);
    assertNoSecrets(md);
    assert.throws(
      () => assertNoSecrets('api_key: FAKE_SECRET_VALUE'),
      (e) => e && e.code === 'site_md_contains_secrets',
    );
  });

  it('host_created missing site.md writes site.md and seeds top10.json', () => {
    bootstrapHost({ root, env, customerNumber, host });
    const siteBefore = path.join(root, env, 'x', customerNumber, 'site.md');
    assert.equal(fs.existsSync(siteBefore), false, 'precondition: no site.md');

    const result = onTreeEvent({
      root,
      env,
      customerNumber,
      host,
      event: 'host_created',
    });

    assert.equal(result.skipped, false);
    assert.equal(result.siteMdCreated, true);
    assert.equal(result.top10Created, true);
    assert.ok(fs.existsSync(result.siteMdPath), 'fail-when: skips site.md');
    assert.ok(fs.existsSync(result.top10Path), 'fail-when: missing top10.json');

    const md = fs.readFileSync(result.siteMdPath, 'utf8');
    assert.match(md, /Site skillbook/);
    assert.match(md, /shop\.example/);
    assertNoSecrets(md);

    const top = JSON.parse(fs.readFileSync(result.top10Path, 'utf8'));
    assert.ok(Array.isArray(top.parts));
    assert.equal(top.parts.length, 0);
    assert.equal(top.seededBy, 'fr-204-site-pass');
  });

  it('widget_created with missing site.md also runs site pass', () => {
    const result = onTreeEvent({
      root,
      env,
      customerNumber,
      host: 'partner.example',
      event: 'widget_created',
    });
    assert.equal(result.skipped, false);
    assert.ok(fs.existsSync(result.siteMdPath), 'fail-when: skips site.md');
    assert.match(fs.readFileSync(result.siteMdPath, 'utf8'), /partner\.example/);
  });

  it('idempotent: existing site.md is not regenerated', () => {
    const first = runSitePass({ root, env, customerNumber, host });
    assert.equal(first.siteMdCreated, true);
    const original = fs.readFileSync(first.siteMdPath, 'utf8');
    fs.writeFileSync(first.siteMdPath, original + '\n<!-- marker -->\n', 'utf8');

    const second = onTreeEvent({
      root,
      env,
      customerNumber,
      host: 'other.example',
      event: 'host_created',
    });
    assert.equal(second.skipped, true);
    assert.equal(second.reason, 'site_md_exists');
    assert.equal(second.siteMdCreated, false);
    const after = fs.readFileSync(first.siteMdPath, 'utf8');
    assert.match(after, /<!-- marker -->/);
    assert.equal(after.includes('other.example'), false);
  });

  it('ignored events do not write site.md', () => {
    const result = onTreeEvent({
      root,
      env,
      customerNumber,
      host,
      event: 'parts_page',
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'event_ignored');
    assert.equal(
      fs.existsSync(path.join(root, env, 'x', customerNumber, 'site.md')),
      false,
    );
  });

  it('docs/fr/FR-204.md Decision LOCKED ASCII', () => {
    const p = path.join(__dirname, '..', 'docs', 'fr', 'FR-204.md');
    const buf = fs.readFileSync(p);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-204.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /site\.md/);
    assert.match(text, /top10\.json/);
    assert.match(text, /idempotent|existing site\.md/i);
    assert.match(text, /host_created|widget_created/);
  });
});
