'use strict';

/**
 * Service entry for ComponentsPiece widget-agent dispatcher (#1343).
 * Long-running process on the rclone server; polls SQS FIFO.
 * AWS SDK client is optional — inject queue for tests / local fake.
 */

const { createDispatcher } = require('./dispatcher');

async function main() {
  const queueUrl = process.env.A_SEARCH_WIDGET_AGENT_QUEUE_URL;
  if (!queueUrl) {
    console.error('A_SEARCH_WIDGET_AGENT_QUEUE_URL required');
    process.exit(2);
  }
  // Real AWS wiring is ops-installed; this entry documents the contract.
  console.log(
    JSON.stringify({
      service: 'a-search-widget-agent-dispatcher',
      queueUrl: queueUrl.replace(/\/\/.*@/, '//'),
      poolSize: process.env.AGENT_POOL_SIZE || '2',
      rcloneRoot: process.env.A_SEARCH_RCLONE_ROOT || '',
      note: 'Inject AWS SQS client in production host start script',
    }),
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { createDispatcher, main };