'use strict';

/**
 * FR-191 / #1038: second-region stack via region+stage context (name suffixes).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function utf8NoBom(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.notEqual(buf[0], 0xef, `${rel} must be UTF-8 without BOM`);
  const text = buf.toString('utf8');
  for (let i = 0; i < text.length; i += 1) {
    assert.ok(
      text.charCodeAt(i) < 128,
      `${rel} non-ASCII at ${i}: U+${text.charCodeAt(i).toString(16)}`,
    );
  }
  return text;
}

function resourcesOfType(tpl, type) {
  return Object.values(tpl.Resources || {}).filter((r) => r && r.Type === type);
}

describe('FR-191 second-region stack via context', () => {
  it('resolveDeployNameSuffix / region token helpers', () => {
    const {
      resolveRegionNameSuffix,
      resolveDeployNameSuffix,
      resolveStackId,
    } = require('../cdk/lib/resolve-stage-suffix');
    assert.equal(resolveRegionNameSuffix({}), '');
    assert.equal(resolveRegionNameSuffix({ includeRegionInNames: true, region: 'eu-west-2' }), '-euwest2');
    assert.equal(resolveRegionNameSuffix({ regionSuffix: 'euwest1' }), '-euwest1');
    assert.equal(
      resolveDeployNameSuffix({
        stage: 'standby',
        includeRegionInNames: true,
        region: 'eu-west-1',
      }),
      '-standby-euwest1',
    );
    assert.equal(
      resolveStackId({
        stage: 'standby',
        includeRegionInNames: true,
        region: 'eu-west-1',
      }),
      'ASearchStack-standby-euwest1',
    );
    assert.equal(resolveStackId({ stage: 'dev' }), 'ASearchStack-dev');
    assert.throws(() => resolveRegionNameSuffix({ regionSuffix: 'Bad_X' }), /FR-191/);
  });

  it('wire + docs Decision LOCKED', () => {
    const stack = utf8NoBom('cdk/lib/a-search-stack.js');
    assert.match(stack, /FR-191/);
    assert.match(stack, /resolveDeployNameSuffix/);
    const bin = utf8NoBom('cdk/bin/a-search.js');
    assert.match(bin, /FR-191|includeRegionInNames/);
    const fr = utf8NoBom('docs/fr/FR-191.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /includeRegionInNames|regionSuffix/);
    assert.match(fr, /eu-west-2|standby/);
    const deploy = utf8NoBom('docs/deploy.md');
    assert.match(deploy, /FR-191/);
    assert.match(deploy, /includeRegionInNames|second.region|multi-region/i);
  });

  it('synth two fake regions with distinct name suffixes', () => {
    let cdk;
    try {
      cdk = require('aws-cdk-lib');
    } catch (err) {
      if (err && err.code === 'MODULE_NOT_FOUND') {
        // CI owns synth; helpers + wire pins still run.
        return;
      }
      throw err;
    }
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const { resolveStackId } = require('../cdk/lib/resolve-stage-suffix');

    const cases = [
      {
        region: 'eu-west-2',
        stage: 'primary',
        outdir: path.join(root, 'cdk.out-fr191-primary'),
      },
      {
        region: 'eu-west-1',
        stage: 'standby',
        outdir: path.join(root, 'cdk.out-fr191-standby'),
      },
    ];

    const entryNames = [];
    for (const c of cases) {
      fs.rmSync(c.outdir, { recursive: true, force: true });
      const ctx = {
        stage: c.stage,
        region: c.region,
        includeRegionInNames: true,
      };
      const app = new cdk.App({ outdir: c.outdir, context: ctx });
      const stackId = resolveStackId(ctx);
      new ASearchStack(app, stackId, {
        env: { region: c.region, account: '111111111111' },
      });
      app.synth();
      const tpl = JSON.parse(
        fs.readFileSync(path.join(c.outdir, `${stackId}.template.json`), 'utf8'),
      );
      const entry = resourcesOfType(tpl, 'AWS::Lambda::Function').find(
        (r) =>
          r.Properties &&
          typeof r.Properties.FunctionName === 'string' &&
          r.Properties.FunctionName.startsWith('a-search-entry-'),
      );
      assert.ok(entry, `missing entry for ${c.stage}`);
      entryNames.push(entry.Properties.FunctionName);
      assert.match(
        entry.Properties.FunctionName,
        new RegExp(`a-search-entry-${c.stage}-euwest`),
      );
    }
    assert.notEqual(entryNames[0], entryNames[1]);
  });
});
