'use strict';

/**
 * FR-140: docs/deploy.md installable playbook needles + README pointer.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('FR-140 deploy playbook', () => {
  it('docs/deploy.md covers auth, bootstrap, secrets, deploy, SearchApiUrl, smoke, rclone', () => {
    const p = path.join(root, 'docs', 'deploy.md');
    assert.ok(fs.existsSync(p), 'docs/deploy.md required');
    const text = read('docs/deploy.md');

    assert.match(text, /bootstrap/i);
    assert.match(text, /cdk bootstrap|npx cdk bootstrap/i);
    assert.match(text, /aws sts get-caller-identity|AWS auth|credentials/i);

    assert.match(text, /jwtSecretArn/);
    assert.match(text, /mssqlSecretArn/);
    assert.match(text, /ProviderSecretArn|amazonProviderSecretArn/i);
    assert.match(text, /JWT_ISSUER/);
    assert.match(text, /FR-136|FR-123/);
    assert.match(text, /FR-137/);
    assert.match(text, /FR-138/);

    assert.match(text, /cdk deploy/i);
    assert.match(text, /SearchApiUrl/);
    assert.match(text, /smoke/i);
    assert.match(text, /POST[^\n]{0,40}\/search|\/search/i);
    assert.match(text, /selftest/i);
    assert.match(text, /rclone/i);
    assert.match(text, /rclone-results\.md/);

    // No embedded secrets / JWTs
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}/);
    assert.doesNotMatch(text, /AKIA[0-9A-Z]{16}/);
    assert.match(text, /[Nn]ever[\s\S]{0,80}secret|No secrets|never put secret/i);
  });

  it('README points at docs/deploy.md; FR-140 Decision LOCKED; release-gap playbook Yes', () => {
    const readme = read('README.md');
    assert.match(readme, /docs\/deploy\.md|\[Deploy[^\]]*\]\(docs\/deploy\.md\)/i);

    const fr = read('docs/fr/FR-140.md');
    assert.match(fr, /Decision|LOCKED/i);
    assert.match(fr, /deploy\.md/i);
    assert.match(fr, /SearchApiUrl|bootstrap|rclone/i);

    const gap = read('docs/release-gap-aws-installable-2026-10-09.md');
    assert.match(
      gap,
      /docs\/deploy\.md[^\n]*\*\*Yes\*\*[^\n]*FR-140|install playbook[^\n]*\*\*Yes\*\*[^\n]*FR-140/i,
    );
  });
});
