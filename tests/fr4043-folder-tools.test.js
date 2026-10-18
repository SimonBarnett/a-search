'use strict';
/**
 * FR #4043 / #4087: folder tools (Get-FolderMeta + Invoke-FolderSearch) exist under tools/.
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
  assert.match(readme, /bucket_root|FR #4087/);
  const meta = fs.readFileSync(path.join(tools, 'Get-FolderMeta.ps1'), 'utf8');
  const folderS3 = fs.readFileSync(path.join(tools, 'FolderS3.ps1'), 'utf8');
  assert.match(meta, /Get-FolderS3Annotations/);
  assert.match(meta, /bucket_root/);
  assert.match(folderS3, /ConvertFrom-FolderS3Json/);
  assert.match(folderS3, /AllowEmptyString/);
  assert.doesNotMatch(meta, /annotations\.json/);
  const pester = fs.readFileSync(
    path.join(root, 'tests', 'fr4043-folder-tools.Tests.ps1'),
    'utf8',
  );
  assert.match(pester, /path_outside_mount/);
  assert.match(pester, /secret masking/i);
  assert.match(pester, /FR #4087/);
  assert.match(pester, /ConvertFrom-FolderS3Json/);
});
