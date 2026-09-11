/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RoleApiCredentials } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import { apiTest, testData } from '../../fixtures';
import { stripInspect } from '../../fixtures/helpers/expect_fixture_eql';
import { makeChecksWithStatus, getChecksDateRange } from '../../fixtures/helpers/make_checks';

apiTest.describe('snapshot count', { tag: tags.stateful.classic }, () => {
  let adminCredentials: RoleApiCredentials;

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

  apiTest('returns null snapshot when no data', async ({ apiClient }) => {
    const params = new URLSearchParams({
      dateRangeStart: new Date().toISOString(),
      dateRangeEnd: new Date().toISOString(),
    });
    const response = await apiClient.get(`${testData.API_URLS.SNAPSHOT_COUNT.slice(1)}?${params}`, {
      headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
      responseType: 'json',
    });

    expect(stripInspect(response.body)).toStrictEqual({
      total: 0,
      up: 0,
      down: 0,
    });
  });

  for (const includeTimespan of [true, false]) {
    for (const includeObserver of [true, false]) {
      apiTest(
        `counts correctly with timespans=${includeTimespan} and observer=${includeObserver}`,
        async ({ apiClient, esClient }) => {
          const promises: Array<Promise<any>> = [];
          const mogrify = (d: any) => {
            if (!includeTimespan) {
              delete d.monitor.timespan;
            }
            if (!includeObserver) {
              delete d.observer;
            }
            return d;
          };

          for (let i = 0; i < 10; i++) {
            promises.push(
              makeChecksWithStatus(esClient, `up-${i}`, 5, 2, 10000, {}, 'up', mogrify)
            );
          }
          for (let i = 0; i < 7; i++) {
            promises.push(
              makeChecksWithStatus(esClient, `down-${i}`, 5, 2, 10000, {}, 'down', mogrify)
            );
          }

          const allResults = await Promise.all(promises);
          const dateRange = getChecksDateRange(allResults);

          const params = new URLSearchParams({
            dateRangeStart: dateRange.start,
            dateRangeEnd: dateRange.end,
          });
          const response = await apiClient.get(
            `${testData.API_URLS.SNAPSHOT_COUNT.slice(1)}?${params}`,
            {
              headers: { ...adminCredentials.apiKeyHeader, ...testData.COMMON_HEADERS },
              responseType: 'json',
            }
          );

          expect(stripInspect(response.body)).toStrictEqual({
            total: 17,
            up: 10,
            down: 7,
          });
        }
      );
    }
  }
});
