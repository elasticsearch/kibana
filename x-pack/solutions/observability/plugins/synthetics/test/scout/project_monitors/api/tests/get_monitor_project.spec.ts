/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Migrated from the FTR suite
 * `apis/synthetics/get_monitor_project.ts` (`GetProjectMonitors`).
 *
 * Covers the `GET /api/synthetics/project/{projectName}/monitors` listing
 * endpoint: cursor pagination (`per_page` + `search_after`) for every monitor
 * type, URL-encoded project names, and partial last pages.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { syntheticsMonitorSavedObjectType } from '../../../../../common/types/saved_objects';
import { apiTest, mergeSyntheticsApiHeaders } from '../../../common/fixtures';
import {
  deleteProjectMonitors,
  getProjectMonitors,
  pushProjectMonitors,
} from '../../../common/fixtures/project';
import { deleteAllSyntheticsPackagePolicies } from '../../../common/fixtures/fleet';
import { tryForTime } from '../../../common/fixtures/retry';
import { projectBrowserMonitorFixture } from '../fixtures/data/project_browser_monitor';
import { projectHttpMonitorFixture } from '../fixtures/data/project_http_monitor';
import { projectTcpMonitorFixture } from '../fixtures/data/project_tcp_monitor';
import { projectIcmpMonitorFixture } from '../../../common/fixtures/data/project_icmp_monitor';
import type { ScoutPrivateLocation } from '../../../common/services/synthetics_private_location_api_service';

const MONITOR_SO_TYPES = [
  'synthetics-private-location',
  syntheticsMonitorSavedObjectType,
  'ingest-package-policies',
];

const TOTAL_MONITORS = 30;
const PER_PAGE = 20;
const TEST_TIMEOUT = 300_000;

interface ProjectMonitorMeta {
  journey_id: string;
  hash: string;
  [key: string]: unknown;
}

apiTest.describe(
  'GetProjectMonitors',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let adminHeaders: Record<string, string>;
    let privateLocation: ScoutPrivateLocation;

    /** Builds `count` project monitors of `template` type, bound to the private location. */
    const buildMonitors = (template: Record<string, any>, prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => {
        const monitor = JSON.parse(JSON.stringify(template)) as Record<string, any>;
        return {
          ...monitor,
          id: `${prefix} ${i}`,
          name: `test name ${i}`,
          hash: monitor.hash as string,
          locations: [],
          privateLocations: [privateLocation.label],
        };
      });

    /** Asserts every input monitor is present (by journey_id + hash) in the metadata. */
    const checkFields = (
      meta: ProjectMonitorMeta[],
      monitors: Array<{ id: string; hash: string }>
    ) => {
      for (const monitor of monitors) {
        const present = meta.some(
          (item) => item.journey_id === monitor.id && item.hash === monitor.hash
        );
        expect(present).toBe(true);
      }
    };

    const getPage = async (
      apiClient: ApiClientFixture,
      project: string,
      query: string
    ): Promise<{ monitors: ProjectMonitorMeta[]; total: number; after_key?: string }> => {
      const res = await getProjectMonitors(apiClient, editorHeaders, project, { query });
      return res.body as { monitors: ProjectMonitorMeta[]; total: number; after_key?: string };
    };

    apiTest.beforeAll(async ({ requestAuth, kbnClient, apiServices }) => {
      await kbnClient.savedObjects.clean({ types: MONITOR_SO_TYPES });
      const { apiKeyHeader: editorKey } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(editorKey, { Accept: 'application/json' });
      const { apiKeyHeader: adminKey } = await requestAuth.getApiKey('admin');
      adminHeaders = mergeSyntheticsApiHeaders(adminKey);
      await apiServices.syntheticsPrivateLocations.installSyntheticsPackage();
      privateLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();
    });

    apiTest.beforeEach(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: [syntheticsMonitorSavedObjectType] });
    });

    apiTest.afterAll(async ({ apiClient, kbnClient }) => {
      await deleteAllSyntheticsPackagePolicies(apiClient, adminHeaders);
      await kbnClient.savedObjects.clean({ types: MONITOR_SO_TYPES });
    });

    /** Pages through all monitors via per_page/search_after and runs `checkFields`. */
    const runTwoPageScenario = async (
      apiClient: ApiClientFixture,
      project: string,
      monitors: Array<{ id: string; hash: string }>,
      projectInUrl: string = project
    ) => {
      await tryForTime(60_000, async () => {
        const firstPage = await getPage(apiClient, projectInUrl, `per_page=${PER_PAGE}`);
        expect(firstPage.monitors).toHaveLength(PER_PAGE);
        expect(firstPage.total).toBe(TOTAL_MONITORS);
        expect(typeof firstPage.after_key).toBe('string');

        const secondPage = await getPage(
          apiClient,
          projectInUrl,
          `per_page=${PER_PAGE}&search_after=${encodeURIComponent(firstPage.after_key!)}`
        );
        expect(secondPage.monitors).toHaveLength(TOTAL_MONITORS - PER_PAGE);
        checkFields([...firstPage.monitors, ...secondPage.monitors], monitors);
      });
    };

    apiTest('project monitors - fetches all monitors - browser', async ({ apiClient }) => {
      apiTest.setTimeout(TEST_TIMEOUT);
      const project = `test-brower-suite-${uuidv4()}`;
      const monitors = buildMonitors(
        projectBrowserMonitorFixture.monitors[0],
        'test browser id',
        TOTAL_MONITORS
      );
      try {
        await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
        await runTwoPageScenario(apiClient, project, monitors);
      } finally {
        await deleteProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          monitors.map((m) => m.id)
        ).catch(() => {});
      }
    });

    apiTest('project monitors - fetches all monitors - http', async ({ apiClient }) => {
      apiTest.setTimeout(TEST_TIMEOUT);
      const project = `test-http-suite-${uuidv4()}`;
      const monitors = buildMonitors(
        projectHttpMonitorFixture.monitors[1],
        'test http id',
        TOTAL_MONITORS
      );
      try {
        await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
        await runTwoPageScenario(apiClient, project, monitors);
      } finally {
        await deleteProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          monitors.map((m) => m.id)
        ).catch(() => {});
      }
    });

    apiTest('project monitors - fetches all monitors - tcp', async ({ apiClient }) => {
      apiTest.setTimeout(TEST_TIMEOUT);
      const project = `test-tcp-suite-${uuidv4()}`;
      const monitors = buildMonitors(
        projectTcpMonitorFixture.monitors[0],
        'test tcp id',
        TOTAL_MONITORS
      );
      try {
        await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
        await runTwoPageScenario(apiClient, project, monitors);
      } finally {
        await deleteProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          monitors.map((m) => m.id)
        ).catch(() => {});
      }
    });

    apiTest('project monitors - fetches all monitors - icmp', async ({ apiClient }) => {
      apiTest.setTimeout(TEST_TIMEOUT);
      const project = `test-icmp-suite-${uuidv4()}`;
      const monitors = buildMonitors(
        projectIcmpMonitorFixture.monitors[0],
        'test icmp id',
        TOTAL_MONITORS
      );
      try {
        await pushProjectMonitors(apiClient, editorHeaders, project, monitors);
        await runTwoPageScenario(apiClient, project, monitors);
      } finally {
        await deleteProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          monitors.map((m) => m.id)
        ).catch(() => {});
      }
    });

    apiTest('project monitors - handles url ecoded project names', async ({ apiClient }) => {
      apiTest.setTimeout(TEST_TIMEOUT);
      const projectName = `Test project ${uuidv4()}`;
      const encoded = encodeURIComponent(projectName);
      const monitors = buildMonitors(
        projectIcmpMonitorFixture.monitors[0],
        'test url id',
        TOTAL_MONITORS
      );
      try {
        await pushProjectMonitors(apiClient, editorHeaders, projectName, monitors);
        await runTwoPageScenario(apiClient, projectName, monitors, encoded);
      } finally {
        await deleteProjectMonitors(
          apiClient,
          editorHeaders,
          encoded,
          monitors.map((m) => m.id)
        ).catch(() => {});
      }
    });

    apiTest('project monitors - handles per_page parameter', async ({ apiClient }) => {
      apiTest.setTimeout(TEST_TIMEOUT);
      const project = `test-suite-${uuidv4()}`;
      const perPage = 10;
      const totalMonitors = 25; // not evenly divisible so the last page is partial
      const monitors = buildMonitors(
        projectIcmpMonitorFixture.monitors[0],
        'test-id',
        totalMonitors
      ).map((m, i) => ({ ...m, id: `test-id-${i}`, name: `test-name-${i}` }));

      try {
        await pushProjectMonitors(apiClient, editorHeaders, project, monitors);

        await tryForTime(60_000, async () => {
          let afterId: string | undefined;
          const fullResponse: ProjectMonitorMeta[] = [];
          const pageCounts: number[] = [];
          const pageTotals: number[] = [];
          let count: number;
          do {
            const query = `per_page=${perPage}${
              afterId ? `&search_after=${encodeURIComponent(afterId)}` : ''
            }`;
            const response = await getPage(apiClient, project, query);
            count = response.monitors.length;
            pageCounts.push(count);
            pageTotals.push(response.total);
            fullResponse.push(...response.monitors);
            afterId = response.after_key;
          } while (count === perPage);

          // every page reports the same grand total, and pages are
          // [perPage, perPage, remainder] for 25 monitors at perPage=10.
          expect(pageTotals.every((total) => total === totalMonitors)).toBe(true);
          expect(pageCounts).toStrictEqual([perPage, perPage, totalMonitors - perPage * 2]);
          expect(fullResponse).toHaveLength(totalMonitors);
          checkFields(fullResponse, monitors);
        });
      } finally {
        await deleteProjectMonitors(
          apiClient,
          editorHeaders,
          project,
          monitors.map((m) => m.id)
        ).catch(() => {});
      }
    });
  }
);
