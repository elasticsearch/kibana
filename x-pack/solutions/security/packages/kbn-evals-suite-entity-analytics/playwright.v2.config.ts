/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createPlaywrightEvalsConfig } from '@kbn/evals';

/**
 * Playwright config for Entity Analytics V2 evals.
 *
 * Requires the evals_entity_analytics_v2 Scout configSet, which enables the
 * entityAnalyticsEntityStoreV2 experimental flag and the Entity Store V2 UI setting.
 *
 * Run with:
 *   node scripts/evals start --suite entity-analytics-v2
 */
export default createPlaywrightEvalsConfig({
  testDir: `${__dirname}/evals/v2`,
  repetitions: Number(process.env.EVALUATION_REPETITIONS ?? 1),
  // 30-minute ceiling for V2: half of V1 (60 min) because V2 uses bulk-seed and skips the
  // ~5 min real-pipeline path that V1 exercises end-to-end. Still has to cover Agent Builder
  // converse latency × example count plus the 120s waitForCondition in
  // entity_attachment_side_effect.spec.ts. If V2 examples grow well past current count, raise
  // this — but V2 should never need V1's 60 min unless we re-enable the real-pipeline path.
  timeout: 30 * 60_000,
});
