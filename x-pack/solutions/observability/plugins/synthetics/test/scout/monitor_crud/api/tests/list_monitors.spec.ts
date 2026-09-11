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
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../../../common/fixtures';
import type { ScoutPrivateLocation } from '../../../common/services/synthetics_private_location_api_service';
import {
  enableSynthetics,
  listMonitors,
  saveMonitorInternal,
} from '../../../common/fixtures/monitors';

interface ListedMonitor {
  id: string;
  name?: string;
}

/**
 * Ported from FTR `apis/synthetics/list_monitors.ts` (`ListMonitorsAPI` >
 * `useLogicalAndFor parameter`).
 *
 * The FTR suite created two monitors on the public locations `dev`/`dev2` and
 * asserted absolute `monitors.length` counts after a full data wipe. Scout API
 * specs share a worker (and may run alongside other synthetics specs), so this
 * port instead:
 *   - uses two *private* locations (always available in Scout) for the
 *     location-based `useLogicalAndFor` cases,
 *   - tags both monitors with a per-run uuid and filters the response to that
 *     run, so the assertions are order- and pollution-independent.
 */
apiTest.describe(
  'ListMonitorsAPI useLogicalAndFor parameter',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let firstLocation: ScoutPrivateLocation;
    let secondLocation: ScoutPrivateLocation;
    // Unique per run so the list assertions only see this spec's monitors.
    const runId = uuidv4();
    const firstTag = `a-${runId}`;
    const secondTag = `b-${runId}`;

    const countRunMonitors = (body: { monitors: ListedMonitor[] }) =>
      body.monitors.filter((monitor) => monitor.name?.includes(runId)).length;

    apiTest.beforeAll(async ({ requestAuth, apiClient, apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
      await enableSynthetics(apiClient, editorHeaders);

      firstLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();
      secondLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();

      const common = { type: 'http', url: 'https://www.elastic.co' };
      // Monitor A: both tags, both locations. Monitor B: second tag, first location.
      await saveMonitorInternal(apiClient, editorHeaders, {
        ...common,
        name: `Monitor A ${runId}`,
        tags: [firstTag, secondTag],
        locations: [firstLocation, secondLocation],
      });
      await saveMonitorInternal(apiClient, editorHeaders, {
        ...common,
        name: `Monitor B ${runId}`,
        tags: [secondTag],
        locations: [firstLocation],
      });
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
    });

    const list = (apiClient: ApiClientFixture, query: string) =>
      listMonitors(apiClient, editorHeaders, query);

    apiTest(
      'returns both monitors when searching both tags without useLogicalAndFor',
      async ({ apiClient }) => {
        const response = await list(apiClient, `tags=${firstTag}&tags=${secondTag}`);
        expect(countRunMonitors(response.body)).toBe(2);
      }
    );

    apiTest(
      'returns only the monitor matching all tags when useLogicalAndFor includes tags',
      async ({ apiClient }) => {
        const response = await list(
          apiClient,
          `tags=${firstTag}&tags=${secondTag}&useLogicalAndFor=tags`
        );
        expect(countRunMonitors(response.body)).toBe(1);
      }
    );

    apiTest(
      'returns both monitors when searching both locations without useLogicalAndFor',
      async ({ apiClient }) => {
        const response = await list(
          apiClient,
          `locations=${firstLocation.id}&locations=${secondLocation.id}`
        );
        expect(countRunMonitors(response.body)).toBe(2);
      }
    );

    apiTest(
      'returns only the monitor matching all locations when useLogicalAndFor includes locations',
      async ({ apiClient }) => {
        const response = await list(
          apiClient,
          `locations=${firstLocation.id}&locations=${secondLocation.id}&useLogicalAndFor=locations`
        );
        expect(countRunMonitors(response.body)).toBe(1);
      }
    );
  }
);
