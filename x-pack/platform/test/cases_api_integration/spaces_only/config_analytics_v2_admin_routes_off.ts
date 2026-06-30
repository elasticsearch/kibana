/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createTestConfig } from '../common/config';

/**
 * FTR config that exercises the partial-gating case for cases-analytics v2:
 * `xpack.cases.analyticsV2.enabled=true` (v2 service starts, `/state` is
 * registered) but `xpack.cases.analyticsV2.enableAdminRoutes=false` (the
 * mutating admin routes are NOT registered, requests return HTTP 404).
 *
 * The 404 (vs 403) on the gated paths is intentional — it prevents health
 * probes from fingerprinting that the subsystem is present but locked down.
 * The companion FTR config `config_analytics_v2.ts` runs the same suite with
 * the admin routes ENABLED so this config focuses purely on the gating
 * contract.
 *
 * Kept in its own config (vs added to `config_analytics_v2.ts`) because
 * `enableAdminRoutes` is a startup flag — toggling it mid-suite is not
 * supported. Test surface is intentionally tiny (three HTTP status
 * assertions) so the additional Kibana boot is a fixed, bounded cost.
 */
export default createTestConfig('spaces_only', {
  disabledPlugins: ['security'],
  license: 'trial',
  ssl: false,
  testFiles: [require.resolve('./tests/trial/analytics_v2_admin_routes_off')],
  kbnServerArgs: [
    '--xpack.cases.analyticsV2.enabled=true',
    // Explicit `false` (default) — the assertion is exactly this gating
    // contract, so the flag must be visible in the config.
    '--xpack.cases.analyticsV2.enableAdminRoutes=false',
  ],
});
