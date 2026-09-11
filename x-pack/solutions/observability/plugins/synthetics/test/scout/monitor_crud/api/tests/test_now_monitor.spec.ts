/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import { tags } from '@kbn/scout-oblt';
import {
  apiTest,
  LOCAL_PUBLIC_LOCATION,
  mergeSyntheticsApiHeaders,
  PUBLIC_API_VERSION,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../../../common/fixtures';
import { addMonitor, enableSynthetics, testNowMonitor } from '../../../common/fixtures/monitors';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/test_now_monitor.ts`.
 *
 * Both monitors use the Elastic-managed `dev` public location, so no private
 * location is required. (The migrated fixture omits a default location, so it is
 * supplied here; a monitor with zero locations is rejected with a 400.)
 */
apiTest.describe(
  'RunTestManually',
  {
    tag: [...tags.stateful.classic, ...tags.serverless.observability.complete],
  },
  () => {
    let editorHeaders: Record<string, string>;
    const spacesToCleanUp: string[] = [];

    apiTest.beforeAll(async ({ requestAuth, apiClient, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
      await enableSynthetics(apiClient, editorHeaders);
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      for (const spaceId of spacesToCleanUp) {
        await kbnClient.spaces.delete(spaceId).catch(() => {});
      }
      spacesToCleanUp.length = 0;
    });

    apiTest('runs test manually', async ({ apiClient }) => {
      const createRes = await addMonitor(apiClient, editorHeaders, {
        ...httpMonitorFixture,
        locations: [LOCAL_PUBLIC_LOCATION],
      });
      const monitorId = (createRes.body as { id: string }).id;

      const res = await testNowMonitor(apiClient, editorHeaders, monitorId);
      expect(typeof (res.body as { testRunId: string }).testRunId).toBe('string');
    });

    apiTest('works in non default space', async ({ apiClient, kbnClient }) => {
      const SPACE_ID = `test-space-${uuidv4()}`;
      const SPACE_NAME = `test-space-name ${uuidv4()}`;
      await kbnClient.spaces.create({ id: SPACE_ID, name: SPACE_NAME });
      spacesToCleanUp.push(SPACE_ID);

      const createRes = await apiClient.post(`s/${SPACE_ID}/api/synthetics/monitors`, {
        headers: { ...editorHeaders, 'elastic-api-version': PUBLIC_API_VERSION },
        body: { ...httpMonitorFixture, locations: [LOCAL_PUBLIC_LOCATION], spaces: [] },
        responseType: 'json',
      });
      expect(createRes).toHaveStatusCode(200);
      const monitorId = (createRes.body as { id: string }).id;

      const res = await testNowMonitor(apiClient, editorHeaders, monitorId, { spaceId: SPACE_ID });
      expect(typeof (res.body as { testRunId: string }).testRunId).toBe('string');
    });
  }
);
