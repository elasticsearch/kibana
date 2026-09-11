/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RoleApiCredentials } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import type { MonitorSummary } from '../../fixtures/helpers/runtime_types';
import { apiTest, testData } from '../../fixtures';
import { makeChecksWithStatus } from '../../fixtures/helpers/make_checks';

apiTest.describe('monitor state scoping', { tag: tags.stateful.classic }, () => {
  let adminCredentials: RoleApiCredentials;

  const numIps = 4;

  apiTest.beforeAll(async ({ requestAuth, esArchiver, esClient }) => {
    adminCredentials = await requestAuth.getApiKey('admin');
    await esArchiver.loadIfNeeded(testData.ES_ARCHIVES.BLANK);
    await esClient.deleteByQuery({
      index: testData.GENERATED_INDEX,
      query: { match_all: {} },
      refresh: true,
      conflicts: 'proceed',
    });
  });

  apiTest(
    'should return no monitors and have no errors for checks with no summaries',
    async ({ apiClient, esClient }) => {
      const testMonitorId = 'scope-test-id';
      const dateRangeStart = new Date().toISOString();

      await makeChecksWithStatus(esClient, testMonitorId, 1, numIps, 1, {}, 'up', (d) => {
        delete d.summary;
        return d;
      });

      const params = new URLSearchParams({
        dateRangeStart,
        dateRangeEnd: new Date().toISOString(),
        pageSize: String(10),
      });
      const response = await apiClient.get(`${testData.API_URLS.MONITOR_LIST.slice(1)}?${params}`, {
        headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
        responseType: 'json',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.summaries).toHaveLength(0);
    }
  );

  apiTest(
    'should not match non summary documents when check status does not match document status',
    async ({ apiClient, esClient }) => {
      const testMonitorId = 'scope-test-id-mismatch';
      const makeApiParams = (monitorId: string, filterClauses: any[] = []): string => {
        return JSON.stringify({
          bool: {
            filter: [{ match: { 'monitor.id': monitorId } }, ...filterClauses],
          },
        });
      };

      const dateRangeStart = new Date().toISOString();
      const checks = await makeChecksWithStatus(
        esClient,
        testMonitorId,
        1,
        numIps,
        1,
        {},
        'up',
        (d) => {
          if (d.summary) {
            d.monitor.status = 'down';
            d.summary.up--;
            d.summary.down++;
          }
          return d;
        }
      );
      const dateRangeEnd = new Date().toISOString();
      const nonSummaryIp = checks[0][0].monitor.ip;

      await apiTest.step(
        'should not match non summary documents if the check status does not match the document status',
        async () => {
          const filters = makeApiParams(testMonitorId, [{ match: { 'monitor.ip': nonSummaryIp } }]);
          const params = new URLSearchParams({
            dateRangeStart,
            dateRangeEnd,
            pageSize: String(10),
            filters,
            statusFilter: 'down',
          });
          const response = await apiClient.get(
            `${testData.API_URLS.MONITOR_LIST.slice(1)}?${params}`,
            {
              headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
              responseType: 'json',
            }
          );
          expect(response.body.summaries).toHaveLength(0);
        }
      );

      await apiTest.step(
        'should not match non summary documents if the check status does not match',
        async () => {
          const filters = makeApiParams(testMonitorId, [{ match: { 'monitor.ip': nonSummaryIp } }]);
          const params = new URLSearchParams({
            dateRangeStart,
            dateRangeEnd,
            pageSize: String(10),
            filters,
            statusFilter: 'up',
          });
          const response = await apiClient.get(
            `${testData.API_URLS.MONITOR_LIST.slice(1)}?${params}`,
            {
              headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
              responseType: 'json',
            }
          );
          expect(response.body.summaries).toHaveLength(0);
        }
      );

      await apiTest.step('should not match any documents outside of the date range', async () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 1);
        const futureStart = futureDate.toISOString();
        futureDate.setDate(futureDate.getDate() + 1);
        const futureEnd = futureDate.toISOString();

        const filters = makeApiParams(testMonitorId);
        const params = new URLSearchParams({
          dateRangeStart: futureStart,
          dateRangeEnd: futureEnd,
          pageSize: String(10),
          filters,
          statusFilter: 'up',
        });
        const response = await apiClient.get(
          `${testData.API_URLS.MONITOR_LIST.slice(1)}?${params}`,
          {
            headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
            responseType: 'json',
          }
        );
        expect(response.body.summaries).toHaveLength(0);
      });
    }
  );

  const setupStatusFilterMonitors = async (
    esClient: Parameters<typeof makeChecksWithStatus>[0]
  ) => {
    const upMonitorId = 'up-test-id';
    const downMonitorId = 'down-test-id';
    const mixMonitorId = 'mix-test-id';

    const observer = {
      geo: {
        name: 'US-East',
        location: '40.7128, -74.0060',
      },
    };

    const dateRangeStart = new Date().toISOString();

    await makeChecksWithStatus(esClient, upMonitorId, 1, 4, 1, {}, 'up');
    await makeChecksWithStatus(esClient, upMonitorId, 1, 4, 1, { observer }, 'up');

    await makeChecksWithStatus(esClient, downMonitorId, 1, 4, 1, {}, 'down');
    await makeChecksWithStatus(esClient, downMonitorId, 1, 4, 1, { observer }, 'down');

    await makeChecksWithStatus(esClient, mixMonitorId, 1, 4, 1, {}, 'up');
    await makeChecksWithStatus(esClient, mixMonitorId, 1, 4, 1, { observer }, 'down');

    const dateRangeEnd = new Date().toISOString();

    return { upMonitorId, downMonitorId, mixMonitorId, dateRangeStart, dateRangeEnd };
  };

  apiTest(
    'should return all monitors when no status filter',
    async ({ apiClient, esClient, esArchiver }) => {
      await esArchiver.loadIfNeeded(testData.ES_ARCHIVES.BLANK);
      const { dateRangeStart, dateRangeEnd, downMonitorId, mixMonitorId, upMonitorId } =
        await setupStatusFilterMonitors(esClient);

      const params = new URLSearchParams({
        dateRangeStart,
        dateRangeEnd,
        pageSize: String(10),
      });
      const response = await apiClient.get(`${testData.API_URLS.MONITOR_LIST.slice(1)}?${params}`, {
        headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
        responseType: 'json',
      });

      const { summaries } = response.body;
      expect(summaries).toHaveLength(3);
      expect(summaries.map((summary: MonitorSummary) => summary.monitor_id)).toStrictEqual([
        downMonitorId,
        mixMonitorId,
        upMonitorId,
      ]);
    }
  );

  apiTest(
    'should return a monitor with mix state if check status filter is down',
    async ({ apiClient, esClient, esArchiver }) => {
      await esArchiver.loadIfNeeded(testData.ES_ARCHIVES.BLANK);
      const { upMonitorId, dateRangeStart, dateRangeEnd } = await setupStatusFilterMonitors(
        esClient
      );

      const params = new URLSearchParams({
        dateRangeStart,
        dateRangeEnd,
        pageSize: String(10),
        statusFilter: 'down',
      });
      const response = await apiClient.get(`${testData.API_URLS.MONITOR_LIST.slice(1)}?${params}`, {
        headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
        responseType: 'json',
      });

      const { summaries } = response.body;
      expect(summaries).toHaveLength(2);
      summaries.forEach((summary: MonitorSummary) => {
        expect(summary.monitor_id).not.toStrictEqual(upMonitorId);
      });
    }
  );

  apiTest(
    'should not return a monitor with mix state if check status filter is up',
    async ({ apiClient, esClient, esArchiver }) => {
      await esArchiver.loadIfNeeded(testData.ES_ARCHIVES.BLANK);
      const { upMonitorId, dateRangeStart, dateRangeEnd } = await setupStatusFilterMonitors(
        esClient
      );

      const deadline = Date.now() + 10000;
      let lastError: Error | undefined;
      while (Date.now() < deadline) {
        try {
          const params = new URLSearchParams({
            dateRangeStart,
            dateRangeEnd,
            pageSize: String(10),
            statusFilter: 'up',
          });
          const response = await apiClient.get(
            `${testData.API_URLS.MONITOR_LIST.slice(1)}?${params}`,
            {
              headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
              responseType: 'json',
            }
          );

          const { summaries } = response.body;
          expect(summaries).toHaveLength(1);
          expect(summaries[0].monitor_id).toStrictEqual(upMonitorId);
          lastError = undefined;
          break;
        } catch (e: any) {
          lastError = e;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (lastError) throw lastError;
    }
  );
});
