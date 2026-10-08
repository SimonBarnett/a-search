'use strict';

/**
 * FR-059l: CDK/API Gateway exposes /selftest next to /search (synth pin).
 * Probe logic is out of scope.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-059l CDK API Gateway /selftest route', () => {
  it('stack wires GET|POST /selftest EntrySelftestIntegration next to /search', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /path:\s*['"]\/search['"]/);
    assert.match(text, /path:\s*['"]\/selftest['"]/);
    assert.match(text, /EntrySelftestIntegration/);
    assert.match(text, /HttpMethod\.GET/);
    assert.match(text, /HttpMethod\.POST/);
    assert.match(text, /FR-059b\/l|FR-059l|\/selftest next to \/search/);
  });

  it('npm run synth: template has GET and POST /selftest routes', () => {
    const r = spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'synth'],
      { cwd: root, encoding: 'utf8', shell: true, timeout: 180_000 },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);

    const templatePath = path.join(
      root,
      'cdk.out',
      'ASearchStack.template.json',
    );
    assert.ok(
      fs.existsSync(templatePath),
      'synth must emit ASearchStack.template.json',
    );
    const parsed = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const routes = Object.values(parsed.Resources || {}).filter(
      (res) => res && res.Type === 'AWS::ApiGatewayV2::Route',
    );
    const keys = routes.map((res) => String(res.Properties && res.Properties.RouteKey));
    assert.ok(
      keys.some((k) => /POST\s+\/search/i.test(k)),
      `expected POST /search in ${JSON.stringify(keys)}`,
    );
    assert.ok(
      keys.some((k) => /GET\s+\/selftest/i.test(k)),
      `expected GET /selftest in ${JSON.stringify(keys)}`,
    );
    assert.ok(
      keys.some((k) => /POST\s+\/selftest/i.test(k)),
      `expected POST /selftest in ${JSON.stringify(keys)}`,
    );
  });
});
