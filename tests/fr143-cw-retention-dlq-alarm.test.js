'use strict';

/**
 * FR-143: CloudWatch log retention (30d) on Lambdas + DLQ depth alarms
 * (ApproximateNumberOfMessagesVisible >= 1) to a placeholder SNS topic.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { queueName } = require('../providers/queueName');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const ENABLED_IDS = ['amazon', 'ebay', 'rakuten', 'cj', 'awin', 'impact', 'kelkoo', 'aliexpress', 'etsy', 'skimlinks']; // FR-167..170
const RETENTION_DAYS = 30;

describe('FR-143 CloudWatch retention + DLQ depth alarms', () => {
  it('stack source wires LogGroup retention, SNS placeholder, and DLQ alarms', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /FR-143/);
    assert.match(text, /aws-logs/);
    assert.match(text, /function lambdaLogGroup|new logs\.LogGroup/);
    assert.match(text, /RetentionDays\.ONE_MONTH/);
    assert.match(text, /logGroup:\s*lambdaLogGroup/);
    assert.match(text, /aws-sns|sns\.Topic/);
    assert.match(text, /aws-cloudwatch|cloudwatch\.Alarm/);
    assert.match(
      text,
      /ApproximateNumberOfMessagesVisible|metricApproximateNumberOfMessagesVisible/,
    );
    assert.match(text, /SnsAction|addAlarmAction/);
    // Placeholder only - no concrete subscription endpoints in stack source
    assert.doesNotMatch(text, /https:\/\/hooks\./i);
  });

  it('synth: Lambdas get 30d log groups; each DLQ has depth alarm to SNS', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr143');
    fs.rmSync(outdir, { recursive: true, force: true });
    const app = new cdk.App({ outdir });
    new ASearchStack(app, 'ASearchStack');
    app.synth();

    const templatePath = path.join(outdir, 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'missing ASearchStack.template.json');
    const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const resources = tpl.Resources || {};

    const logGroups = Object.values(resources).filter(
      (res) => res && res.Type === 'AWS::Logs::LogGroup',
    );
    assert.ok(logGroups.length >= 1, 'expected LogGroup resources');
    for (const lg of logGroups) {
      const days = lg.Properties && lg.Properties.RetentionInDays;
      assert.equal(
        Number(days),
        RETENTION_DAYS,
        `LogGroup retention must be ${RETENTION_DAYS}, got ${days}`,
      );
    }

    // Entry + workers (14 after FR-167) + maintainer (2) + onboarding (...) — floor only
    const fns = Object.values(resources).filter(
      (res) => res && res.Type === 'AWS::Lambda::Function',
    );
    assert.ok(fns.length >= 19, `expected >=19 Lambdas, got ${fns.length}`);

    const topics = Object.entries(resources).filter(
      ([, res]) => res && res.Type === 'AWS::SNS::Topic',
    );
    assert.ok(topics.length >= 1, 'expected placeholder SNS topic');

    const alarms = Object.values(resources).filter(
      (res) => res && res.Type === 'AWS::CloudWatch::Alarm',
    );
    // FR-167+FR-168+FR-169: 18 DLQ depth alarms (9 enabled x live+sandbox)
    assert.equal(alarms.length, 20, `expected 20 DLQ depth alarms, got ${alarms.length}`);

    for (const id of ENABLED_IDS) {
      for (const env of ['live', 'sandbox']) {
        const dlqName = `${queueName(id, env)}-dlq`;
        const hit = alarms.find((a) => {
          const name = a.Properties && a.Properties.AlarmName;
          const dims =
            (a.Properties &&
              a.Properties.Dimensions &&
              JSON.stringify(a.Properties.Dimensions)) ||
            '';
          const metric =
            (a.Properties && a.Properties.MetricName) ||
            (a.Properties &&
              a.Properties.Metrics &&
              JSON.stringify(a.Properties.Metrics)) ||
            '';
          return (
            (typeof name === 'string' && name.includes(`${id}-${env}-dlq`)) ||
            dims.includes(dlqName) ||
            JSON.stringify(a).includes(dlqName)
          );
        });
        assert.ok(hit, `missing DLQ depth alarm for ${dlqName}`);
        const props = hit.Properties;
        assert.equal(Number(props.Threshold), 1);
        assert.match(
          String(props.ComparisonOperator),
          /GreaterThanOrEqualToThreshold|GREATER_THAN_OR_EQUAL/i,
        );
        const metricName =
          props.MetricName ||
          (Array.isArray(props.Metrics) &&
            props.Metrics.map((m) => m.MetricStat && m.MetricStat.Metric && m.MetricStat.Metric.MetricName).join(','));
        assert.match(
          String(metricName || JSON.stringify(props)),
          /ApproximateNumberOfMessagesVisible/,
        );
        const actions = [].concat(props.AlarmActions || []);
        assert.ok(actions.length >= 1, `${dlqName} alarm missing AlarmActions`);
      }
    }
  });

  it('docs: FR-143 Decision LOCKED + release-gap CloudWatch Yes', () => {
    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-143.md'), 'utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /LogGroup|RetentionDays|ONE_MONTH|30/);
    assert.match(fr, /ApproximateNumberOfMessagesVisible|DLQ/);
    assert.match(fr, /fr143-cw-retention-dlq-alarm\.test\.js/);

    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-aws-installable-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /\|\s*CloudWatch retention \/ alarms\s*\|\s*\*\*Yes\*\*/);
  });
});
