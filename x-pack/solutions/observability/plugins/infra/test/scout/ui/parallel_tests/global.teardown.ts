/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { globalTeardownHook } from '../fixtures';

globalTeardownHook(
  'Clean up infra data after UI parallel tests',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  async ({ infraSynthtraceEsClient, logsSynthtraceEsClient, apmSynthtraceEsClient, log }) => {
    log.info('Running infra UI global teardown...');

    await infraSynthtraceEsClient.clean();
    log.info('Infra synthtrace data cleaned');

    await logsSynthtraceEsClient.clean();
    log.info('Logs synthtrace data cleaned');

    await apmSynthtraceEsClient.clean();
    log.info('APM synthtrace data cleaned');

    log.info('Infra UI global teardown complete');
  }
);
