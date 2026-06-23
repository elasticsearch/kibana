/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mergeTests, globalTeardownHook as obltGlobalTeardownHook, tags } from '@kbn/scout-oblt';
import { apiTest as profilingFixtures } from '../../common/fixtures';

const globalTeardownHook = mergeTests(obltGlobalTeardownHook, profilingFixtures);

globalTeardownHook(
  'Reset profiling state after UI parallel tests',
  { tag: tags.stateful.classic },
  async ({ profilingSetup, log, profilingHelper }) => {
    log.info('Running profiling UI global teardown...');

    await profilingHelper.cleanupPolicies({ includeAgentPolicy: true });
    await profilingSetup.cleanup();

    log.info('Profiling UI global teardown complete');
  }
);
