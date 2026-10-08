'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
describe('hostile MRB #253 FR-038', () => {
  it('amazon handler.js + worker.handler exist and CDK pins worker.handler', () => {
    const h = require(path.join(root, 'providers/live/amazon/src/handler.js'));
    const w = require(path.join(root, 'providers/live/amazon/src/worker.js'));
    assert.equal(typeof h.handler, 'function');
    assert.equal(typeof w.handler, 'function');
    assert.equal(typeof w.run, 'function');
    const stack = fs.readFileSync(path.join(root, 'cdk/lib/a-search-stack.js'), 'utf8');
    assert.match(stack, /workerHandlerPath\(src\)/);
    assert.match(fs.readFileSync(path.join(root, 'scripts/stage-provider-worker-lambda-asset.js'), 'utf8'), /worker\.handler/);
    const skill = fs.readFileSync(
      path.join(root, 'providers/live/amazon/.grok/skills/a-search-amazon/SKILL.md'),
      'utf8',
    );
    assert.match(skill, /FR-038|SQS Lambda|handler\.js/i);
  });
});
