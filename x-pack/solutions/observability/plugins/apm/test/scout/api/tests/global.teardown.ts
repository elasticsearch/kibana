/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mergeTests, globalTeardownHook as obltGlobalTeardownHook, tags } from '@kbn/scout-oblt';
import { synthtraceFixture } from '@kbn/scout-synthtrace';
import { OTEL_NATIVE_JAVA_TEMPLATE_NAME } from '../../shared';

const globalTeardownHook = mergeTests(obltGlobalTeardownHook, synthtraceFixture);

globalTeardownHook(
  'Clean up APM data after API tests',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  async ({ apmSynthtraceEsClient, esClient, log }) => {
    log.info('Running APM API global teardown...');

    await apmSynthtraceEsClient.clean();
    await esClient.indices
      .deleteIndexTemplate({ name: OTEL_NATIVE_JAVA_TEMPLATE_NAME })
      .catch((error) => {
        // A 404 is expected if the template was never created; surface anything else.
        if (error?.statusCode !== 404) {
          log.warning(
            `Failed to delete index template ${OTEL_NATIVE_JAVA_TEMPLATE_NAME}: ${error?.message}`
          );
        }
      });

    log.info('APM API global teardown complete');
  }
);
