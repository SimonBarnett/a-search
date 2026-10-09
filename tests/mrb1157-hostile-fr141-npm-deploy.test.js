/**
 * MRB #1157 hostile pins for FR-141 npm run deploy + resolve-deploy-env.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('mrb1157: package.json deploy sets requireDeployEnv; resolver + bin wired', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(String(pkg.scripts.deploy || ''), /requireDeployEnv=true/);
  assert.match(String(pkg.scripts.deploy || ''), /cdk deploy/);
  const resolver = read('cdk/lib/resolve-deploy-env.js');
  assert.match(resolver, /FR-141/);
  assert.match(resolver, /missing deploy account/);
  assert.match(resolver, /deployAccount/);
  assert.match(resolver, /CDK_DEFAULT_ACCOUNT/);
  assert.doesNotMatch(resolver, /\b\d{12}\b/);
  const bin = read('cdk/bin/a-search.js');
  assert.match(bin, /resolveDeployEnv/);
  assert.match(bin, /requireDeployEnv/);
});

test('mrb1157: missing account fails with FR-141 message (no aws-cdk-lib)', () => {
  const script = path.join(ROOT, 'scripts/fr141-check-deploy-env.js');
  const r = spawnSync(process.execPath, [script, '--require'], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  assert.notEqual(r.status, 0);
  assert.match(String(r.stderr || r.stdout || ''), /FR-141: missing deploy account/);
});

test('mrb1157: deploy.md + release-gap + FR-141 Decision LOCKED', () => {
  const deploy = read('docs/deploy.md');
  assert.match(deploy, /npm run deploy -- -c account=/);
  assert.match(deploy, /FR-141: missing deploy account/);
  assert.equal(Buffer.from(deploy, 'utf8')[0] !== 0xef, true);
  for (const b of Buffer.from(deploy, 'utf8')) assert.ok(b < 128);
  const gap = read('docs/release-gap-aws-installable-2026-10-09.md');
  assert.match(gap, /npm run deploy[^\n]*\*\*Yes\*\*[^\n]*FR-141/i);
  assert.match(gap, /docs\/deploy\.md[^\n]*\*\*Yes\*\*[^\n]*FR-140/i);
  const fr = read('docs/fr/FR-141.md');
  assert.match(fr, /Decision \(LOCKED\)|Decision.*LOCKED/i);
  assert.ok(fs.existsSync(path.join(ROOT, 'tests/fr141-npm-deploy-context.test.js')));
});
