/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createPlaywrightEvalsConfig } from '@kbn/evals';

export default createPlaywrightEvalsConfig({
  testDir: `${__dirname}/evals`,
  // Every fixture runs inside ONE `evaluate()` test, and the workflow's concurrency group is
  // `max:1 strategy:drop`, so the experiment is forced to `concurrency: 1` and wall time scales
  // linearly: measured ~233s per fixture (6 fixtures = 23.3m). At 35 fixtures x 3 repetitions
  // that is ~6.8h, so a 30m budget cannot pass the suite -- it kills every attempt with
  // "Test timeout of 1800000ms exceeded" regardless of how good the model is. Size the budget
  // from the fixture count, and re-measure whenever the count or the workflow's step cost moves.
  timeout: 8 * 60 * 60_000,
  // Judged decisions are stochastic: a single pass reports sampling noise as if
  // it were signal. Three passes let the reporter separate run-to-run variance
  // from a real difference between models. EVAL_REPETITIONS still overrides
  // this, so local iteration can drop back to 1.
  repetitions: 3,
});
