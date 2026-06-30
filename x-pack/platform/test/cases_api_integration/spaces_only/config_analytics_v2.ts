/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createTestConfig } from '../common/config';

/**
 * FTR config for the cases-analytics v2 integration suite.
 *
 * Runs `tests/trial/analytics_v2/` with the v2 flag flipped on
 * (`xpack.cases.analyticsV2.enabled=true`). Keeping v2 in its own config
 * isolates it from the rest of the trial suite — v2 spins up background
 * tasks (reconciliation, data view bootstrap) that we don't want
 * influencing other tests' fixtures, and a separate config makes it
 * easy to switch the v1 flag independently.
 *
 * `xpack.cases.analyticsV2.enableAdminRoutes=true` opts into the
 * mutating admin routes (`/reset`, `/reconcile/run_soon`) so the suite
 * can exercise them. The read-only `/state` route is registered
 * regardless once v2 is on; the flag only gates the mutating pair. See
 * `cases_analytics_v2/routes/index.ts` for the gating rationale.
 */
export default createTestConfig('spaces_only', {
  disabledPlugins: ['security'],
  license: 'trial',
  ssl: false,
  testFiles: [require.resolve('./tests/trial/analytics_v2')],
  kbnServerArgs: [
    '--xpack.cases.analyticsV2.enabled=true',
    '--xpack.cases.analyticsV2.enableAdminRoutes=true',
    // Tighten Task Manager's poll interval (default 3s). reconcile /
    // reset task latency dominates `runReconcileSoon` and
    // `waitForResetComplete`; 500ms cuts the worst-case wait ~6×.
    // Mirrors `security_solution_api_integration`, which uses 1000.
    '--xpack.task_manager.poll_interval=500',
  ],
});
