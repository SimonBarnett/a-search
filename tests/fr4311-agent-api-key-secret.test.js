'use strict';

/**
 * FR #4311 (reopened): the search stack generates the agent API key in
 * Secrets Manager. Entry reads it through a dynamic reference. Outputs are
 * SearchApiUrl and the secret ARN. Existing construct ids stay put.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ensureDefaultStackSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

/** Construct ids on origin/main before this change. New ids must be additive. */
const STABLE_CONSTRUCT_IDS = [
  'AwinOnboardingLiveFunctionName',
  'AwinOnboardingLiveRuleName',
  'AwinOnboardingLiveSchedule',
  'AwinOnboardingSandboxFunctionName',
  'AwinOnboardingSandboxRuleName',
  'DbBackedDeadLetterQueue',
  'DbBackedDeadLetterQueueUrl',
  'DbBackedQueue',
  'DbBackedQueueUrl',
  'EntryFunction',
  'EntryFunctionName',
  'EntryJwtSecretArn',
  'HttpApiAccessLogGroup',
  'HttpApiDefaultStage',
  'ImpactOnboardingLiveFunctionName',
  'ImpactOnboardingLiveRuleName',
  'ImpactOnboardingSandboxFunctionName',
  'ImpactOnboardingSandboxRuleName',
  'OpsAlarmTopic',
  'OpsAlarmTopicArn',
  'RedqueenSqlDrainUser',
  'RedqueenSqlDrainUserName',
  'ResultsBucket',
  'ResultsBucketArn',
  'ResultsBucketName',
  'SearchApiUrl',
  'SearchHttpApi',
  'ShopSyncDeadLetterQueue',
  'ShopSyncDeadLetterQueueUrl',
  'ShopSyncDlqDepthAlarm',
  'ShopSyncFifoQueue',
  'ShopSyncFifoQueueUrl',
  'WalrusConsumerUser',
  'WalrusConsumerUserArn',
  'WalrusConsumerUserName',
  'WidgetAgentDeadLetterQueue',
  'WidgetAgentDlqUrl',
  'WidgetAgentEnqueueFunction',
  'WidgetAgentEnqueueFunctionName',
  'WidgetAgentQueue',
  'WidgetAgentQueueUrl',
  'WidgetAgentS3_INjson',
  'WidgetAgentSweepDaily',
  'WidgetEventsDeadLetterQueue',
  'WidgetEventsDeadLetterQueueUrl',
  'WidgetEventsQueue',
  'WidgetEventsQueueUrl',
  'WidgetStatsRollupSchedule',
];

const ADDED_CONSTRUCT_IDS = ['AgentApiKeySecret', 'AgentApiKeySecretArn'];

function constructIds(text) {
  const ids = new Set();
  const re = /new [\w.]+\(this, '([^']+)'/g;
  let m;
  while ((m = re.exec(text))) ids.add(m[1]);
  return ids;
}

describe('FR-4311 agent API key secret', () => {
  it('stack generates AgentApiKeySecret and does not take -c agentApiKey', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /new secretsmanager\.Secret\(this, 'AgentApiKeySecret'/);
    assert.match(text, /generateSecretString/);
    assert.match(text, /excludePunctuation:\s*true/);
    assert.match(text, /agentApiKeySecret\.secretValue\.unsafeUnwrap\(\)/);
    assert.match(text, /agentApiKeySecret\.grantRead\(entry\)/);
    assert.match(text, /new cdk\.CfnOutput\(this, 'AgentApiKeySecretArn'/);
    assert.match(text, /new cdk\.CfnOutput\(this, 'SearchApiUrl'/);
    assert.doesNotMatch(text, /tryGetContext\('agentApiKey'\)/);
    const ids = constructIds(text);
    for (const id of STABLE_CONSTRUCT_IDS) {
      assert.ok(ids.has(id), 'missing stable construct id ' + id);
    }
    const extra = [...ids].filter((id) => !STABLE_CONSTRUCT_IDS.includes(id));
    assert.deepEqual(extra.sort(), ADDED_CONSTRUCT_IDS.slice().sort());
  });

  it('docs output the secret ARN and do not tell deploy to pass the key', () => {
    const deploy = fs.readFileSync(path.join(root, 'docs', 'deploy.md'), 'utf8');
    const fanout = fs.readFileSync(path.join(root, 'docs', 'search-fanout.md'), 'utf8');
    assert.match(fanout, /AgentApiKeySecretArn/);
    assert.match(fanout, /dynamic reference/);
    assert.doesNotMatch(deploy, /-c agentApiKey=/);
    assert.doesNotMatch(fanout, /-c agentApiKey=/);
  });

  it('synth: secret exists, entry env is a dynamic ref, logical ids stay', () => {
    const { outDir } = ensureDefaultStackSynth(root);
    const templatePath = path.join(outDir, 'ASearchStack.template.json');
    const raw = fs.readFileSync(templatePath, 'utf8');
    const tpl = JSON.parse(raw);
    const resources = tpl.Resources || {};
    const logicalIds = Object.keys(resources);

    const agent = Object.entries(resources).find(([logicalId, res]) => {
      if (!res || res.Type !== 'AWS::SecretsManager::Secret') return false;
      const desc = String((res.Properties && res.Properties.Description) || '');
      return /AgentApiKey/.test(logicalId) || /FR #4311/.test(desc);
    });
    assert.ok(agent, 'missing AgentApiKeySecret');
    const [agentLogicalId, agentRes] = agent;
    assert.equal(agentRes.DeletionPolicy, 'Retain');
    const gen = agentRes.Properties && agentRes.Properties.GenerateSecretString;
    assert.ok(gen && typeof gen === 'object');
    assert.equal(agentRes.Properties.SecretString, undefined);
    assert.equal(gen.ExcludePunctuation, true);

    const entry = Object.values(resources).find(
      (res) =>
        res &&
        res.Type === 'AWS::Lambda::Function' &&
        res.Properties &&
        res.Properties.FunctionName === 'a-search-entry',
    );
    assert.ok(entry, 'missing a-search-entry');
    const vars = (entry.Properties.Environment && entry.Properties.Environment.Variables) || {};
    const keyRef = vars.A_SEARCH_AGENT_API_KEY;
    const keyEnv = JSON.stringify(keyRef || '');
    assert.match(keyEnv, /\{\{resolve:secretsmanager:/);
    // :SecretString::: is the dynamic-ref field selector, not a stored value.
    const parts = keyRef && keyRef['Fn::Join'] && keyRef['Fn::Join'][1];
    assert.ok(Array.isArray(parts) && parts.length === 3, keyEnv);
    assert.equal(parts[0], '{{resolve:secretsmanager:');
    assert.equal(typeof parts[1].Ref, 'string');
    assert.equal(parts[2], ':SecretString:::}}');

    const outputs = tpl.Outputs || {};
    assert.ok(outputs.SearchApiUrl, 'SearchApiUrl output missing');
    assert.ok(outputs.AgentApiKeySecretArn, 'AgentApiKeySecretArn output missing');
    const arnOut = JSON.stringify(outputs.AgentApiKeySecretArn);
    assert.match(arnOut, new RegExp(agentLogicalId));
    assert.doesNotMatch(arnOut, /SecretString/);
    assert.doesNotMatch(raw, /tryGetContext\('agentApiKey'\)/);

    for (const id of ['EntryFunction', 'SearchHttpApi', 'DbBackedQueue', 'WidgetAgentQueue', 'ResultsBucket']) {
      assert.ok(
        logicalIds.some((logicalId) => logicalId.startsWith(id)),
        'logical id prefix changed or missing: ' + id,
      );
    }
    const agentIds = logicalIds.filter((logicalId) => logicalId.startsWith('AgentApiKey'));
    assert.ok(agentIds.length >= 1, 'AgentApiKey logical id missing');
  });
});
