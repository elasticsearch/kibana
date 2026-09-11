/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/api';
import { tags } from '@kbn/scout-oblt';
import { apiTest, mergeSyntheticsApiHeaders } from '../../../common/fixtures';
import { addMonitor } from '../../../common/fixtures/monitors';

const SYNTHETICS_MONITOR_TYPE = 'synthetics-monitor';
const LEGACY_SYNTHETICS_MONITOR_TYPE = 'synthetics-monitor-multi-space';

interface LabelCount {
  label: string;
  count: number;
}
const byLabel = (a: LabelCount, b: LabelCount) => a.label.localeCompare(b.label);

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/get_filters.ts`.
 *
 * Tests accumulate monitors across `test()` blocks (worker-scoped Kibana
 * state persists between tests), so ordering matters. This mirrors the
 * original `describe` that relied on shared state between `it`s.
 */
apiTest.describe(
  'getMonitorFilters',
  {
    tag: [...tags.stateful.classic, ...tags.serverless.observability.complete],
  },
  () => {
    let editorHeaders: Record<string, string>;
    let privateLocation: { id: string; label: string };

    apiTest.beforeAll(async ({ requestAuth, apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({
        types: [SYNTHETICS_MONITOR_TYPE, LEGACY_SYNTHETICS_MONITOR_TYPE],
      });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
      privateLocation = await apiServices.syntheticsPrivateLocations.getSharedPrivateLocation();
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({
        types: [SYNTHETICS_MONITOR_TYPE, LEGACY_SYNTHETICS_MONITOR_TYPE],
      });
    });

    apiTest('get list of filters (empty)', async ({ apiClient }) => {
      const res = await apiClient.get('internal/synthetics/monitor/filters', {
        headers: editorHeaders,
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(200);
      expect(res.body).toMatchObject({
        monitorTypes: [],
        tags: [],
        locations: [],
        projects: [],
        schedules: [],
      });
    });

    apiTest('get list of filters with monitorTypes', async ({ apiClient }) => {
      const newMonitor = {
        name: 'Sample name',
        type: 'http',
        urls: 'https://elastic.co',
        tags: ['apm', 'synthetics'],
        locations: [privateLocation],
      };

      await addMonitor(apiClient, editorHeaders, newMonitor);

      const res = await apiClient.get('internal/synthetics/monitor/filters', {
        headers: editorHeaders,
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(200);
      expect(res.body).toMatchObject({
        monitorTypes: [{ label: 'http', count: 1 }],
        tags: [
          { label: 'apm', count: 1 },
          { label: 'synthetics', count: 1 },
        ],
        locations: [{ label: privateLocation.id, count: 1 }],
        projects: [],
        schedules: [{ label: '3', count: 1 }],
      });
    });

    apiTest('get list of filters for legacy saved object type monitor', async ({ apiClient }) => {
      await addMonitor(
        apiClient,
        editorHeaders,
        {
          name: 'Legacy Monitor',
          type: 'icmp',
          host: 'https://legacy.elastic.co',
          tags: ['legacy', 'synthetics'],
          locations: [privateLocation],
        },
        { savedObjectType: LEGACY_SYNTHETICS_MONITOR_TYPE }
      );

      const res = await apiClient.get('internal/synthetics/monitor/filters', {
        headers: editorHeaders,
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(200);
      const body = res.body as {
        monitorTypes: Array<{ label: string; count: number }>;
        tags: Array<{ label: string; count: number }>;
        locations: Array<{ label: string; count: number }>;
        schedules: Array<{ label: string; count: number }>;
      };
      expect([...body.monitorTypes].sort(byLabel)).toStrictEqual([
        { label: 'http', count: 1 },
        { label: 'icmp', count: 1 },
      ]);
      expect([...body.tags].sort(byLabel)).toStrictEqual([
        { label: 'apm', count: 1 },
        { label: 'legacy', count: 1 },
        { label: 'synthetics', count: 2 },
      ]);
      expect(body.locations).toStrictEqual([{ label: privateLocation.id, count: 2 }]);
      expect(body.schedules).toStrictEqual([{ label: '3', count: 2 }]);
    });

    apiTest('get list of filters with both legacy and modern monitors', async ({ apiClient }) => {
      await addMonitor(apiClient, editorHeaders, {
        name: 'Modern Monitor',
        type: 'http',
        urls: 'https://modern.elastic.co',
        tags: ['multi-space', 'synthetics'],
        locations: [privateLocation],
      });

      await addMonitor(
        apiClient,
        editorHeaders,
        {
          name: 'Legacy Monitor 3',
          type: 'icmp',
          host: 'https://legacy2.elastic.co',
          tags: ['legacy2', 'synthetics'],
          locations: [privateLocation],
        },
        { savedObjectType: LEGACY_SYNTHETICS_MONITOR_TYPE }
      );

      const res = await apiClient.get('internal/synthetics/monitor/filters', {
        headers: editorHeaders,
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(200);
      const body = res.body as {
        monitorTypes: Array<{ label: string; count: number }>;
        tags: Array<{ label: string; count: number }>;
        locations: Array<{ label: string; count: number }>;
        schedules: Array<{ label: string; count: number }>;
      };
      expect([...body.monitorTypes].sort(byLabel)).toStrictEqual([
        { label: 'http', count: 2 },
        { label: 'icmp', count: 2 },
      ]);
      expect([...body.tags].sort(byLabel)).toStrictEqual([
        { label: 'apm', count: 1 },
        { label: 'legacy', count: 1 },
        { label: 'legacy2', count: 1 },
        { label: 'multi-space', count: 1 },
        { label: 'synthetics', count: 4 },
      ]);
      expect(body.locations).toStrictEqual([{ label: privateLocation.id, count: 4 }]);
      expect(body.schedules).toStrictEqual([{ label: '3', count: 4 }]);
    });
  }
);
