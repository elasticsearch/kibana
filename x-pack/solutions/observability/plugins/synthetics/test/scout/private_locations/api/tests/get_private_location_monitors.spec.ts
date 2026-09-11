/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import {
  apiTest,
  mergeSyntheticsApiHeaders,
  SYNTHETICS_API_URLS,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../../../common/fixtures';
import type { ScoutPrivateLocation } from '../../../common/services/synthetics_private_location_api_service';
import { addMonitor } from '../../../common/fixtures/monitors';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';

/** Legacy synthetics monitor saved-object type (pre multi-space migration). */
const LEGACY_SYNTHETICS_MONITOR_TYPE = 'synthetics-monitor';

interface LocationMonitorCount {
  id: string;
  count: number;
}

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/get_private_location_monitors.ts`.
 *
 * The FTR suite asserted exact equality of the global count endpoint because it
 * wiped all synthetics data and ran serially. Scout runs specs in parallel
 * workers against a shared cluster, so this spec instead provisions its own
 * dedicated private location and asserts the count for *that* location id —
 * which monitors created against other locations cannot affect.
 */
apiTest.describe(
  'GetPrivateLocationMonitors',
  {
    tag: [...tags.stateful.classic, ...tags.serverless.observability.complete],
  },
  () => {
    let editorHeaders: Record<string, string>;
    let privateLocation: ScoutPrivateLocation;

    const getLocationMonitorCounts = async (apiClient: ApiClientFixture) => {
      const res = await apiClient.get(SYNTHETICS_API_URLS.PRIVATE_LOCATIONS_MONITORS, {
        headers: editorHeaders,
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(200);
      return res.body as LocationMonitorCount[];
    };

    apiTest.beforeAll(async ({ requestAuth, apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
      // Dedicated (not shared) location so its monitor count is deterministic.
      privateLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
    });

    apiTest('lists the private location in available service locations', async ({ apiClient }) => {
      const res = await apiClient.get(SYNTHETICS_API_URLS.SERVICE_LOCATIONS, {
        headers: editorHeaders,
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(200);
      const { locations } = res.body as {
        locations: Array<{ id: string; isServiceManaged: boolean }>;
      };
      expect(
        locations.some((loc) => loc.id === privateLocation.id && loc.isServiceManaged === false)
      ).toBe(true);
    });

    apiTest(
      'returns the monitor count for a private location across modern and legacy monitors',
      async ({ apiClient }) => {
        // modern (multi-space) monitor
        await addMonitor(apiClient, editorHeaders, {
          ...httpMonitorFixture,
          namespace: 'default',
          name: `Modern monitor ${uuidv4()}`,
          locations: [privateLocation],
        });

        // legacy `synthetics-monitor` saved-object type monitor on the same location
        await addMonitor(
          apiClient,
          editorHeaders,
          {
            ...httpMonitorFixture,
            namespace: 'default',
            name: `Legacy monitor ${uuidv4()}`,
            locations: [privateLocation],
          },
          { savedObjectType: LEGACY_SYNTHETICS_MONITOR_TYPE }
        );

        const counts = await getLocationMonitorCounts(apiClient);
        const locationCount = counts.find(({ id }) => id === privateLocation.id);
        expect(locationCount).toStrictEqual({ id: privateLocation.id, count: 2 });
      }
    );
  }
);
