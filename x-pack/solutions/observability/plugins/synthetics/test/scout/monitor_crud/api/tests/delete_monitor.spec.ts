/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import type { ScoutPrivateLocation } from '../../../common/services/synthetics_private_location_api_service';
import {
  apiTest,
  mergeSyntheticsApiHeaders,
  PUBLIC_API_VERSION,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../../../common/fixtures';
import {
  addMonitor,
  deleteMonitors,
  deleteMonitorByIdParam,
  getMonitor,
} from '../../../common/fixtures/monitors';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/delete_monitor.ts`.
 *
 * The FTR `validates empty monitor id` test short-circuited in the helper and
 * never issued a request (effectively a no-op). It is replaced here with a real
 * `{ ids: [] }` request that exercises the route's `minSize: 1` validation.
 */
apiTest.describe(
  'DeleteMonitorRoute',
  {
    tag: [...tags.stateful.classic, ...tags.serverless.observability.complete],
  },
  () => {
    let editorHeaders: Record<string, string>;
    let privateLocation: ScoutPrivateLocation;

    apiTest.beforeAll(async ({ requestAuth, apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
      privateLocation = await apiServices.syntheticsPrivateLocations.getSharedPrivateLocation();
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
    });

    const saveHttpMonitor = async (
      apiClient: ApiClientFixture,
      overrides: Record<string, unknown> = {}
    ) => {
      const res = await addMonitor(apiClient, editorHeaders, {
        ...httpMonitorFixture,
        locations: [privateLocation],
        ...overrides,
      });
      return (res.body as { id: string }).id;
    };

    apiTest('deletes monitor by id', async ({ apiClient }) => {
      const monitorId = await saveHttpMonitor(apiClient);

      const deleteResponse = await deleteMonitors(apiClient, editorHeaders, [monitorId]);
      expect(deleteResponse.body).toStrictEqual([{ id: monitorId, deleted: true }]);

      await getMonitor(apiClient, editorHeaders, monitorId, { statusCode: 404 });
    });

    apiTest('deletes monitor by param id', async ({ apiClient }) => {
      const monitorId = await saveHttpMonitor(apiClient);

      const deleteResponse = await deleteMonitorByIdParam(apiClient, editorHeaders, monitorId);
      expect(deleteResponse.body).toStrictEqual([{ id: monitorId, deleted: true }]);

      await getMonitor(apiClient, editorHeaders, monitorId, { statusCode: 404 });
    });

    apiTest('throws error if both body and param are missing', async ({ apiClient }) => {
      const res = await apiClient.delete('api/synthetics/monitors', {
        headers: { ...editorHeaders, 'elastic-api-version': PUBLIC_API_VERSION },
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(400);
    });

    apiTest('deletes multiple monitors by id', async ({ apiClient }) => {
      const monitorId = await saveHttpMonitor(apiClient);
      const monitorId2 = await saveHttpMonitor(apiClient, { name: 'another -2' });

      const deleteResponse = await deleteMonitors(apiClient, editorHeaders, [
        monitorId2,
        monitorId,
      ]);

      const sortById = (a: { id: string }, b: { id: string }) => (a.id > b.id ? 1 : -1);
      expect((deleteResponse.body as Array<{ id: string }>).sort(sortById)).toStrictEqual(
        [
          { id: monitorId2, deleted: true },
          { id: monitorId, deleted: true },
        ].sort(sortById)
      );

      await getMonitor(apiClient, editorHeaders, monitorId, { statusCode: 404 });
    });

    apiTest('returns 404 if monitor id is not found', async ({ apiClient }) => {
      const invalidMonitorId = 'invalid-id';
      const expected404Message = `Monitor id ${invalidMonitorId} not found!`;

      const deleteResponse = await deleteMonitors(apiClient, editorHeaders, [invalidMonitorId]);
      expect(deleteResponse.body).toStrictEqual([
        {
          id: invalidMonitorId,
          deleted: false,
          error: expected404Message,
        },
      ]);
    });

    apiTest('validates empty monitor id', async ({ apiClient }) => {
      await deleteMonitors(apiClient, editorHeaders, [], { statusCode: 400 });
    });
  }
);
