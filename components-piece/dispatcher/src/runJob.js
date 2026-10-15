'use strict';

/**
 * Route a queue job to host/widget agent passes (#1343).
 * Injectable pass runners for tests; default wires shared/widgets/* .
 */

const path = require('node:path');
const fs = require('node:fs');
const { hostDir, widgetDir } = require('../../../shared/widgets/widgetPath');

function defaultPasses() {
  return {
    host: require('../../../shared/widgets/agentSitePass').onTreeEvent,
    widgetContext: require('../../../shared/widgets/agentWidgetContext')
      .runWidgetContextPass,
    ingest: require('../../../shared/widgets/agentIngest').runIngestPass,
    prune: require('../../../shared/widgets/agentPruneTop10').runPrunePass,
    sweep: require('../../../shared/widgets/agentPruneTop10').runSweepPass,
  };
}

function writeLastRun(root, env, customerNumber, widgetGuid, status) {
  const rel =
    widgetGuid == null
      ? path.join(hostDir(env, customerNumber), '_agent', 'last-run.json')
      : path.join(
          widgetDir(env, customerNumber, widgetGuid),
          '_agent',
          'last-run.json',
        );
  const abs = path.join(root, rel.replace(/\//g, path.sep));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(status, null, 2), 'utf8');
  return abs;
}

/**
 * @param {object} job queue body + tier
 * @param {object} ctx { llm, mount, workerId, root, passes }
 */
async function runAgentJob(job, ctx) {
  const passes = (ctx && ctx.passes) || defaultPasses();
  const root = (ctx && ctx.root) || process.env.A_SEARCH_RCLONE_ROOT || '';
  const llm = (ctx && ctx.llm) || { tokensUsed: 0, calls: 0 };
  const mount = (ctx && ctx.mount) || { reads: 0, writes: 0 };

  // Tokens only between job start and job done
  const tokensBefore = llm.tokensUsed || 0;
  llm.calls = (llm.calls || 0) + 1;
  llm.tokensUsed = tokensBefore + (job.tokenCost || 1);
  mount.reads = (mount.reads || 0) + 1;

  const env = job.env;
  const customerNumber = job.customerNumber;
  const widgetGuid = job.widgetGuid;
  const tier = job.tier || { upgraded: false, layout: 'horizontal' };
  const eventType = job.eventType;

  let partsCount = 0;
  let passResult = null;

  if (eventType === 'host_created' || eventType === 'site_pass') {
    passResult = passes.host({
      root,
      env,
      customerNumber,
      host: job.host || 'unknown',
      event: 'host_created',
    });
  } else if (
    eventType === 'widget_created' ||
    eventType === 'widget_feedback' ||
    eventType === 'in_ready' ||
    eventType === 'tier_changed'
  ) {
    // host pass first if site.md missing
    const sitePath = path.join(
      root,
      hostDir(env, customerNumber).replace(/\//g, path.sep),
      'site.md',
    );
    if (!fs.existsSync(sitePath) && passes.host) {
      passes.host({
        root,
        env,
        customerNumber,
        host: job.host || 'unknown',
        event: 'host_created',
      });
      mount.writes = (mount.writes || 0) + 1;
    }
    if (passes.widgetContext) {
      passResult = passes.widgetContext({
        root,
        env,
        customerNumber,
        widgetGuid,
        upgraded: !!(tier && tier.upgraded),
        layout: (tier && tier.layout) || 'horizontal',
      });
    }
    if (eventType === 'in_ready' && passes.ingest) {
      const ing = passes.ingest({
        root,
        env,
        customerNumber,
        widgetGuid,
        upgraded: !!(tier && tier.upgraded),
        layout: (tier && tier.layout) || 'horizontal',
      });
      partsCount = (ing && ing.partsCount) || 0;
      passResult = ing;
    }
    if (passes.prune) {
      passes.prune({
        root,
        env,
        customerNumber,
        widgetGuid,
        upgraded: !!(tier && tier.upgraded),
        layout: (tier && tier.layout) || 'horizontal',
      });
    }
  } else if (eventType === 'sweep') {
    passResult = passes.sweep({
      root,
      env,
      customerNumber,
      widgetGuid,
      upgraded: !!(tier && tier.upgraded),
    });
  } else {
    throw new Error('unknown_eventType:' + eventType);
  }

  mount.writes = (mount.writes || 0) + 1;
  const status = {
    eventType,
    startedAt: job._startedAt || new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    result: 'ok',
    partsCount,
    tokensUsed: (llm.tokensUsed || 0) - tokensBefore,
    statsGeneratedAt: job.statsGeneratedAt || null,
    workerId: ctx && ctx.workerId,
  };
  if (root) {
    writeLastRun(root, env, customerNumber, widgetGuid, status);
  }
  return { status, passResult };
}

module.exports = { runAgentJob, writeLastRun, defaultPasses };