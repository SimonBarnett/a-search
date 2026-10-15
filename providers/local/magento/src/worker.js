'use strict';

const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../../../../shared/assertEnv');
const { writeResults } = require('../../../../shared/writeResults');
const {
  normalizeProduct,
  assertProductSchema,
} = require('../../../../worker/lib/normalizeProduct');
const {
  defaultQueryParts,
  MagentoMssqlConfigError,
} = require('./queryParts');

async function handleMessage(msg, deps) {
  const envVars = (deps && deps.env) || process.env;
  assertWorkerEnv(msg, envVars);
  const queryParts =
    (deps && deps.queryParts) ||
    ((m) =>
      defaultQueryParts(m, {
        connect: deps && deps.connect,
        env: envVars,
      }));
  const rows = await queryParts(msg);
  const products = [];
  for (const row of rows || []) {
    const p = normalizeProduct({
      title: row.Title,
      url: row.Url,
      price: row.Price,
      currency: row.Currency,
      imageUrl: row.ImageUrl,
      merchantProductId: row.MerchantProductId,
      source: 'magento',
    });
    assertProductSchema(p);
    products.push(p);
  }
  const putObject = deps && deps.putObject;
  let key;
  let bucket;
  if (typeof putObject === 'function') {
    const written = await writeResults({
      msg,
      products,
      source: 'magento',
      putObject,
      env: envVars,
    });
    key = written && written.key;
    bucket = written && written.bucket;
  }
  return {
    ok: true,
    source: 'magento',
    searchId: msg && msg.searchId,
    products,
    key,
    bucket,
  };
}

module.exports = {
  handleMessage,
  EnvIsolationError,
  MagentoMssqlConfigError,
};
