'use strict';
/**
 * FR #4043: folder tools (Get-FolderMeta + Invoke-FolderSearch) exist under tools/.
 */
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const tools = path.join(root, 'tools');

test('FR-4043 folder tools scripts and README exist', () => {
  for (const f of [
    'FolderS3.ps1',
    'Get-FolderMeta.ps1',
    'Invoke-FolderSearch.ps1',
    'meta.ps1',
    'search.ps1',
    'README-folder-tools.md',
    'folder-tools.config.example.json',
  ]) {
    assert.ok(fs.existsSync(path.join(tools, f)), f);
  }
  const readme = fs.readFileSync(path.join(tools, 'README-folder-tools.md'), 'utf8');
  assert.match(readme, /Get-FolderMeta/);
  assert.match(readme, /Invoke-FolderSearch/);
  assert.match(readme, /list-object-annotations|object annotations/i);
  const meta = fs.readFileSync(path.join(tools, 'Get-FolderMeta.ps1'), 'utf8');
  assert.match(meta, /Get-FolderS3Annotations/);
  assert.doesNotMatch(meta, /annotations\.json/);
  const pester = fs.readFileSync(
    path.join(root, 'tests', 'fr4043-folder-tools.Tests.ps1'),
    'utf8',
  );
  assert.match(pester, /path_outside_mount/);
  assert.match(pester, /secret masking/i);
});
