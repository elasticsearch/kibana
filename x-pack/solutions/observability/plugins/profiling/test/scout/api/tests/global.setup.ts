/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mergeTests, globalSetupHook as obltGlobalSetupHook, tags } from '@kbn/scout-oblt';
import { synthtraceFixture } from '@kbn/scout-synthtrace';

const globalSetupHook = mergeTests(obltGlobalSetupHook, synthtraceFixture);

// `POST /api/fleet/setup` is idempotent but can transiently fail right after Kibana boots:
// it may return 503 "Request timed out" when it collides with the setup Fleet runs on
// startup, or while default packages are still installing. Retry a few times before giving
// up, mirroring the retry already used by `profilingSetup.setupResources`.
const FLEET_SETUP_MAX_ATTEMPTS = 5;
const FLEET_SETUP_RETRY_DELAY_MS = 10_000;

globalSetupHook(
  'Ingest data to Elasticsearch',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  async ({ log, apiServices }) => {
    log.info('Running profiling API global setup...');

    for (let attempt = 1; attempt <= FLEET_SETUP_MAX_ATTEMPTS; attempt++) {
      try {
        await apiServices.fleet.internal.setup();
        log.info('Fleet infrastructure setup completed');
        return;
      } catch (error) {
        if (attempt >= FLEET_SETUP_MAX_ATTEMPTS) {
          log.error(`Fleet setup failed after ${FLEET_SETUP_MAX_ATTEMPTS} attempts`);
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        log.warning(
          `Fleet setup attempt ${attempt}/${FLEET_SETUP_MAX_ATTEMPTS} failed (${message}); retrying in ${FLEET_SETUP_RETRY_DELAY_MS}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, FLEET_SETUP_RETRY_DELAY_MS));
      }
    }
  }
);
