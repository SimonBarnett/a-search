'use strict';

/**
 * docs/mrb-2075: hostile pins for #1343 Agentic Searches / FR-258.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const {
  classifyS3Key,
  messageGroupId,
} = require('../shared/widgets/agentQueue');

describe('mrb2075 hostile FR-258 agentic searches', () => {
  it('FR-258 Decision LOCKED; dispatch doc present', () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-258.md'), 'utf8');
    assert.match(fr, /Decision LOCKED|Status:\s*Decision LOCKED/i);
    assert.match(fr, /#1343|1343/);
    const doc = fs.readFileSync(
      path.join(ROOT, 'docs', 'components-piece-agent-dispatch.md'),
      'utf8',
    );
    assert.match(doc, /EventBridge|SQS FIFO|dispatcher|rclone/i);
  });

  it('classify: trigger suffixes; agent outputs never enqueue', () => {
    assert.equal(
      classifyS3Key('sandbox/x/42/_host.json').eventType,
      'host_created',
    );
    assert.equal(
      classifyS3Key('live/x/42/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/widget.json')
        .eventType,
      'widget_created',
    );
    assert.equal(classifyS3Key('sandbox/x/42/site.md'), null);
    assert.equal(classifyS3Key('sandbox/x/42/wid/live.json'), null);
    assert.equal(classifyS3Key('sandbox/x/42/wid/context.md'), null);
    assert.equal(classifyS3Key('sandbox/x/42/wid/stats.json'), null);
  });

  it('FIFO MessageGroupId host vs widget; CDK pins queue names', () => {
    assert.equal(
      messageGroupId({
        env: 'sandbox',
        customerNumber: '42',
        eventType: 'host_created',
      }),
      'sandbox/42/_host',
    );
    assert.equal(
      messageGroupId({
        env: 'live',
        customerNumber: '42',
        widgetGuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        eventType: 'widget_created',
      }),
      'live/42/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    );
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /a-search-widget-agent\.fifo/);
    assert.match(stack, /a-search-widget-agent-dlq\.fifo/);
    assert.match(stack, /eventBridgeEnabled:\s*true/);
    assert.match(stack, /maxReceiveCount:\s*5/);
  });

  it('dispatcher pool + enqueue Lambda sources exist', () => {
    assert.ok(
      fs.existsSync(
        path.join(ROOT, 'components-piece', 'dispatcher', 'src', 'dispatcher.js'),
      ),
    );
    assert.ok(
      fs.existsSync(
        path.join(ROOT, 'components-piece', 'dispatcher', 'src', 'pool.js'),
      ),
    );
    assert.ok(
      fs.existsSync(
        path.join(ROOT, 'components-piece', 'dispatcher', 'enqueue', 'index.js'),
      ),
    );
  });
});
