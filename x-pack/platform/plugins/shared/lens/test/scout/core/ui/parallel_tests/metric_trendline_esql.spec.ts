/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest, testData } from '../fixtures';

spaceTest.describe(
  'Lens metric trendline on dashboard (ES|QL)',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.set({
        'dateFormat:tz': 'UTC',
        'timepicker:timeDefaults': JSON.stringify({
          from: testData.LOGSTASH_IN_RANGE_DATES.from,
          to: testData.LOGSTASH_IN_RANGE_DATES.to,
        }),
      });
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset('dateFormat:tz', 'timepicker:timeDefaults');
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest(
      'renders trendline with ES|QL data source',
      async ({ apiServices, browserAuth, page, pageObjects, scoutSpace }) => {
        const body = {
          title: 'ESQL Metric trendline',
          time_range: testData.LOGSTASH_IN_RANGE_DATES,
          panels: [
            {
              type: 'vis',
              grid: { x: 0, y: 0, w: 12, h: 8 },
              config: {
                type: 'metric',
                title: 'ESQL Average bytes with trend',
                data_source: {
                  type: 'esql',
                  query:
                    'FROM logstash-* | WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend | STATS avg_bytes = AVG(bytes)',
                },
                metrics: [
                  {
                    type: 'primary',
                    column: 'avg_bytes',
                    background_chart: { type: 'trend' },
                  },
                ],
              },
            },
          ],
        };

        const dashboardId = await apiServices.dashboard.create(body, scoutSpace.id);
        await browserAuth.loginAsPrivilegedUser();
        await pageObjects.dashboard.openDashboardWithId(dashboardId);

        await expect(page.getByTestId('mtrVis')).toBeVisible();
        await expect(pageObjects.lens.metric.trendline).toBeVisible();
      }
    );

    spaceTest(
      'renders trendline for a TS query with TBUCKET',
      async ({ apiServices, browserAuth, page, pageObjects, scoutSpace }) => {
        const dashboardId = await apiServices.dashboard.create(
          {
            title: 'ESQL TS metric trendline',
            time_range: testData.TSDB_IN_RANGE_DATES,
            panels: [
              {
                type: 'vis',
                grid: { x: 0, y: 0, w: 12, h: 8 },
                config: {
                  type: 'metric',
                  title: 'ESQL TS average bytes with trend',
                  data_source: {
                    type: 'esql',
                    query: `TS ${testData.KIBANA_SAMPLE_DATA_LOGS_TSDB_INDEX} | STATS avg_bytes = AVG(AVG_OVER_TIME(bytes_gauge)) BY TBUCKET(100)`,
                  },
                  metrics: [
                    {
                      type: 'primary',
                      column: 'avg_bytes',
                      background_chart: { type: 'trend' },
                    },
                  ],
                },
              },
            ],
          },
          scoutSpace.id
        );

        await browserAuth.loginAsPrivilegedUser();
        await pageObjects.dashboard.openDashboardWithId(dashboardId);

        await expect(page.getByTestId('mtrVis')).toBeVisible();
        await expect(pageObjects.lens.metric.trendline).toBeVisible();
      }
    );

    spaceTest(
      'renders trendline for a FORK query',
      async ({ apiServices, browserAuth, page, pageObjects, scoutSpace }) => {
        const dashboardId = await apiServices.dashboard.create(
          {
            title: 'ESQL FORK metric trendline',
            time_range: testData.LOGSTASH_IN_RANGE_DATES,
            panels: [
              {
                type: 'vis',
                grid: { x: 0, y: 0, w: 12, h: 8 },
                config: {
                  type: 'metric',
                  title: 'ESQL FORK total events with trend',
                  data_source: {
                    type: 'esql',
                    query:
                      'FROM logstash-* | WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend | FORK (STATS `Total Events` = COUNT(*)) (STATS `Event Count` = COUNT(*) BY `Time Bucket` = BUCKET(@timestamp, 75, ?_tstart, ?_tend))',
                  },
                  metrics: [
                    {
                      type: 'primary',
                      column: 'Total Events',
                      background_chart: { type: 'trend' },
                    },
                  ],
                },
              },
            ],
          },
          scoutSpace.id
        );

        await browserAuth.loginAsPrivilegedUser();
        await pageObjects.dashboard.openDashboardWithId(dashboardId);

        await expect(page.getByTestId('mtrVis')).toBeVisible();
        await expect(pageObjects.lens.metric.trendline).toBeVisible();
      }
    );
  }
);
