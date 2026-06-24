/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import { tags } from '@kbn/scout';
import { streamsApiTest as apiTest } from '../../fixtures';
import { PUBLIC_API_HEADERS } from '../../fixtures/constants';

// Inline IDs to avoid pulling in @kbn/workflows which imports YAML files that
// Playwright's esbuild transform cannot load. These strings are stable managed
// workflow identifiers defined in @kbn/workflows managed/definitions/streams_memory.
const MEMORY_WORKFLOW_IDS = [
  'system-streams-memory-synthesis',
  'system-streams-memory-consolidation',
  'system-streams-memory-conversation-scraper',
];

/**
 * Verifies that all three memory managed workflows are installed and marked as valid
 * after the feature flag is enabled. Polls until each workflow appears, since
 * installation is asynchronous (triggered by a reactive observable in plugin start).
 */
apiTest.describe(
  'Memory managed workflows',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    apiTest.beforeAll(async ({ apiServices }) => {
      await apiServices.streamsTest.enableMemory();
    });

    apiTest.afterAll(async ({ apiServices }) => {
      await apiServices.streamsTest.disableMemory();
    });

    for (const workflowId of MEMORY_WORKFLOW_IDS) {
      apiTest(`${workflowId}: is installed and valid`, async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asStreamsAdmin();
        const headers = { ...PUBLIC_API_HEADERS, ...cookieHeader };

        await expect
          .poll(
            async () => {
              const response = await apiClient.get(`api/workflows/workflow/${workflowId}`, {
                headers,
                responseType: 'json',
              });
              return response.statusCode === 200 ? response.body.valid : false;
            },
            { timeout: 20_000, intervals: [1_000] }
          )
          .toBe(true);
      });
    }
  }
);
