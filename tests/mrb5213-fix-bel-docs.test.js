/** MRB #5213 fix: no PowerShell backtick C0 (BEL/TAB) in FR #5070 deploy docs. */
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const files = [
  'tools/README-folder-tools.md',
  'docs/a-affiliates.md',
  'redqueen/awin-agent/README-invite.md',
];

test('fr5070 deploy docs have no BEL/TAB path corruption', () => {
  const tabTools = Buffer.from([0x09]).toString('ascii') + 'ools/';
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(root, rel));
    assert.equal(buf.includes(Buffer.from([0x07])), false, rel + ' has BEL');
    const t = buf.toString('utf8');
    assert.ok(t.includes('deploy-a-affiliates'), rel + ' missing deploy-a-affiliates');
    assert.ok(t.includes('affiliates/'), rel + ' missing affiliates/');
    assert.equal(t.includes(tabTools), false, rel + ' has TAB-ools');
  }
  const folderTools = fs.readFileSync(path.join(root, 'tools/README-folder-tools.md'), 'utf8');
  assert.ok(folderTools.includes('tools/deploy-a-affiliates.ps1'));
});
