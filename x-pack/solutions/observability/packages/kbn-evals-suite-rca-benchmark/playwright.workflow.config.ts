/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Playwright config for the RCA benchmark investigation workflow spec.
 *
 * Uses singleProject: true because the workflow's agent model is set via
 * WORKFLOW_AGENT_CONNECTOR_ID (or the workflow YAML default) — the eval
 * framework's per-connector project multiplexing is not needed here.
 *
 * Run:
 *   RCAEVAL_DATA_DIR=/path/to/re2ob \
 *   EVALUATION_CONNECTOR_ID=<judge-connector-id> \
 *   node scripts/evals run --suite rca-benchmark \
 *     --config playwright.workflow.config.ts
 */
import Path from 'path';
import { createPlaywrightEvalsConfig } from '@kbn/evals';

export default createPlaywrightEvalsConfig({
  testDir: Path.resolve(__dirname, './evals'),
  timeout: 45 * 60_000,
  singleProject: true,
});
