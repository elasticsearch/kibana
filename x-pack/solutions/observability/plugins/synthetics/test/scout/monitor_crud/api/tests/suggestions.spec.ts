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
import { enableSynthetics, saveMonitorInternal } from '../../../common/fixtures/monitors';
import { pushProjectMonitors, setUniqueIds } from '../../../common/fixtures/project';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';
import { projectIcmpMonitorFixture } from '../../../common/fixtures/data/project_icmp_monitor';

const HTTP_MONITOR_COUNT = 20;

interface Suggestion {
  count: number;
  label: string;
  value: string;
}

/**
 * Asserts every `label` is present exactly once with a generated string `value`.
 * Replaces the FTR `expect.arrayContaining([{ value: expect.any(String) }])`
 * (Scout's `expect` has no asymmetric matchers).
 */
const expectMonitorIdLabels = (actual: Suggestion[], labels: string[]) => {
  for (const label of labels) {
    const found = actual.find((entry) => entry.label === label);
    expect(found).toBeDefined();
    expect(found!.count).toBe(1);
    expect(typeof found!.value).toBe('string');
  }
};

/** Asserts a specific aggregation bucket exists with the expected count. */
const expectBucket = (actual: Suggestion[], label: string, count: number) => {
  const found = actual.find((entry) => entry.label === label);
  expect(found).toStrictEqual({ count, label, value: label });
};

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/suggestions.ts`.
 *
 * Each test provisions its own private location in a dedicated space, pushes two
 * project (icmp) monitors, and creates 20 HTTP monitors, then asserts the
 * `/internal/synthetics/suggestions` aggregations. Monitors are wiped in
 * `beforeEach` so the per-test counts are deterministic.
 */
apiTest.describe(
  'SyntheticsSuggestions',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let spaceId: string;
    let privateLocation: { id: string; label: string };

    const suggestionsPath = () => `s/${spaceId}${SYNTHETICS_API_URLS.SUGGESTIONS}`;

    const getSuggestions = async (apiClient: ApiClientFixture, query?: Record<string, string>) => {
      const qs = query
        ? `?${Object.entries(query)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&')}`
        : '';
      const res = await apiClient.get(`${suggestionsPath()}${qs}`, {
        headers: editorHeaders,
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(200);
      return res.body as {
        locations: Array<{ count: number; label: string; value: string }>;
        monitorIds: Array<{ count: number; label: string; value: string }>;
        monitorTypes: Array<{ count: number; label: string; value: string }>;
        projects: Array<{ count: number; label: string; value: string }>;
        tags: Array<{ count: number; label: string; value: string }>;
      };
    };

    const buildHttpMonitors = () =>
      Array.from({ length: HTTP_MONITOR_COUNT }, (_, i) => ({
        ...httpMonitorFixture,
        locations: [privateLocation],
        name: `${httpMonitorFixture.name} ${i}`,
        spaces: [],
      }));

    const projectMonitors = () =>
      setUniqueIds(projectIcmpMonitorFixture.monitors.slice(0, 2), {
        privateLocations: [privateLocation.label],
      });

    apiTest.beforeAll(async ({ requestAuth, apiClient, apiServices, kbnClient }) => {
      const { apiKeyHeader: editorKey } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(editorKey);

      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      await enableSynthetics(apiClient, editorHeaders);

      spaceId = `test-space-${uuidv4()}`;
      await kbnClient.spaces.create({ id: spaceId, name: `test-space-name ${uuidv4()}` });
      privateLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation(
        spaceId
      );
    });

    apiTest.beforeEach(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({
        types: [...SYNTHETICS_MONITOR_SO_TYPES, 'ingest-package-policies'],
        space: spaceId,
      });
    });

    apiTest.afterAll(async ({ apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES, space: spaceId });
      await kbnClient.spaces.delete(spaceId).catch(() => {});
      await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
    });

    apiTest('returns the suggestions', async ({ apiClient }) => {
      const project = `test-project-${uuidv4()}`;
      const monitors = projectMonitors();
      await pushProjectMonitors(apiClient, editorHeaders, project, monitors, { spaceId });

      const httpMonitors = buildHttpMonitors();
      for (const monitor of httpMonitors) {
        await saveMonitorInternal(apiClient, editorHeaders, monitor, { spaceId });
      }

      const body = await getSuggestions(apiClient);

      expect(body.locations).toStrictEqual([
        { count: 22, label: privateLocation.label, value: privateLocation.id },
      ]);

      const expectedLabels = [
        ...httpMonitors.map((monitor) => monitor.name as string),
        ...monitors.map((monitor) => monitor.name as string),
      ];
      expectMonitorIdLabels(body.monitorIds, expectedLabels);

      expect(body.monitorTypes).toStrictEqual([
        { count: 20, label: 'http', value: 'http' },
        { count: 2, label: 'icmp', value: 'icmp' },
      ]);
      expect(body.projects).toStrictEqual([{ count: 2, label: project, value: project }]);
      expectBucket(body.tags, 'tag1', 21);
      expectBucket(body.tags, 'tag2', 21);
      expectBucket(body.tags, 'org:google', 1);
      expectBucket(body.tags, 'service:smtp', 1);
    });

    apiTest('handles query params for projects', async ({ apiClient }) => {
      const httpMonitors = buildHttpMonitors();
      for (const monitor of httpMonitors) {
        await saveMonitorInternal(apiClient, editorHeaders, monitor, { spaceId });
      }

      const project = `test-project-${uuidv4()}`;
      const monitors = projectMonitors();
      await pushProjectMonitors(apiClient, editorHeaders, project, monitors, { spaceId });

      const body = await getSuggestions(apiClient, { projects: project });

      // filtered to the project: only the two icmp monitors and their facets
      expect(body.locations).toStrictEqual([
        { count: 2, label: privateLocation.label, value: privateLocation.id },
      ]);
      expectMonitorIdLabels(
        body.monitorIds,
        monitors.map((monitor) => monitor.name as string)
      );
      expect(body.monitorIds).toHaveLength(2);
      expect(body.monitorTypes).toStrictEqual([{ count: 2, label: 'icmp', value: 'icmp' }]);
      expect(body.projects).toStrictEqual([{ count: 2, label: project, value: project }]);
      expectBucket(body.tags, 'tag1', 1);
      expectBucket(body.tags, 'tag2', 1);
      expectBucket(body.tags, 'org:google', 1);
      expectBucket(body.tags, 'service:smtp', 1);
    });
  }
);
