'use strict';

/** MRB #5308 extra hostile pins: AWS_CONFIG_FILE always set; no BOM; no secrets. */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'redqueen', 'install', 'Register-HasresultsMonitorService.ps1');

describe('MRB #5308 hostile AWS_CONFIG_FILE always-on', () => {
  it('register always AppEnvironmentExtra AWS_CONFIG_FILE after Administrator default', () => {
    const raw = fs.readFileSync(SCRIPT);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false, 'script no UTF-8 BOM');
    const reg = raw.toString('utf8');
    const def = reg.indexOf("Join-Path $env:SystemDrive 'Users\\Administrator\\.aws\\config'");
    const add = reg.indexOf('[void]$envPairs.Add("AWS_CONFIG_FILE=');
    assert.ok(def >= 0, 'default config path');
    assert.ok(add > def, 'Add AWS_CONFIG_FILE after default');
    assert.match(reg, /param > process env > Administrator/);
    assert.equal(/password\s*=/i.test(reg), false);
    const self = fs.readFileSync(__filename);
    assert.equal(self[0] === 0xef && self[1] === 0xbb && self[2] === 0xbf, false, 'test no UTF-8 BOM');
  });
});
