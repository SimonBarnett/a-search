# docs/mrb-73 — hostile pins for FR-023 CDK skeleton

- Vision S4: Deployable Node on AWS with IaC (`npm run synth`)
- Queue names `a-search-amazon-{live|sandbox}` match `providers/queueName.js`
- `npm run synth` uses `npx --no-install cdk` (no global CDK / SAM required)
- Ignore `cdk.out/`; nodejs20 deprecation warning ACCEPTABLE until runtime bump FR