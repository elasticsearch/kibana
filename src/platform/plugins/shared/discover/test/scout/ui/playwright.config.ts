/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createPlaywrightConfig } from '@kbn/scout';

/**
 * Sequential (single-worker) Discover UI suite.
 *
 * Tests that mutate server-wide state — e.g. toggling the `discover.isEsqlDefault`
 * feature flag — must live here rather than in `parallel.playwright.config.ts`.
 * The parallel config runs multiple spec files concurrently against one shared
 * Kibana server, so a server-wide change in one spec would leak into the others.
 * This config defaults to a single worker, so only one spec runs at a time and
 * such mutations stay isolated.
 */
export default createPlaywrightConfig({
  testDir: './tests',
  workers: 1,
  runGlobalSetup: true,
});
