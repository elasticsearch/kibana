/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { LensApiConfig } from '@kbn/lens-embeddable-utils';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { spaceTest } from '@kbn/scout';
import { testData } from '../fixtures';

const ESQL_QUERY = 'FROM logstash-* | STATS count = COUNT(*) BY ts = BUCKET(@timestamp, 1 hour)';

function buildEsqlLensPanel() {
  const config: LensApiConfig = {
    type: 'xy',
    title: 'ES|QL Panel',
    layers: [
      {
        type: 'line',
        ignore_global_filters: false,
        sampling: 1,
        data_source: {
          type: 'esql',
          query: ESQL_QUERY,
        },
        x: { column: 'ts' },
        y: [{ column: 'count' }],
      },
    ],
  };

  return {
    type: LENS_EMBEDDABLE_TYPE,
    grid: { x: 0, y: 0, w: 24, h: 15 },
    config,
  };
}

function buildClassicLensPanel() {
  const config: LensApiConfig = {
    type: 'xy',
    title: 'Classic Panel',
    layers: [
      {
        type: 'line',
        ignore_global_filters: false,
        sampling: 1,
        data_source: {
          type: 'data_view_spec',
          index_pattern: testData.DATA_VIEW_ID.LOGSTASH,
          time_field: '@timestamp',
        },
        x: {
          operation: 'date_histogram',
          field: '@timestamp',
          suggested_interval: 'auto',
          use_original_time_range: false,
          include_empty_rows: false,
        },
        y: [{ operation: 'count', empty_as_null: false }],
      },
    ],
  };

  return {
    type: LENS_EMBEDDABLE_TYPE,
    grid: { x: 0, y: 0, w: 24, h: 15 },
    config,
  };
}

spaceTest.describe(
  'Dashboard with ES|QL Lens panel cancels the search request when navigating away',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsViewer();
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest(
      'cancels the ES|QL request when navigating away from the dashboard',
      async ({ page, apiServices, scoutSpace, pageObjects }) => {
        const title = `ES|QL Lens Dashboard ${Date.now()}`;

        const dashboardId = await apiServices.dashboard.create(
          {
            title,
            time_range: {
              from: testData.LOGSTASH_IN_RANGE_DATES.from,
              to: testData.LOGSTASH_IN_RANGE_DATES.to,
              mode: 'absolute',
            },
            panels: [buildEsqlLensPanel(), buildClassicLensPanel()],
            filters: [
              {
                type: 'dsl',
                dsl: {
                  query: {
                    error_query: {
                      indices: [
                        {
                          name: '*',
                          error_type: 'warning',
                          message: "'Watch out!'",
                          stall_time_seconds: 5,
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
          scoutSpace.id
        );

        // Set up listener before opening the dashboard to avoid race conditions
        const searchInitiationResponsePromises = [
          page.waitForResponse((res) => res.url().endsWith('/esql_async') && res.ok()),
          page.waitForResponse((res) => res.url().endsWith('/ese') && res.ok()),
        ];

        await pageObjects.dashboard.openDashboardWithId(dashboardId, { waitForRender: false });

        await Promise.all(searchInitiationResponsePromises);

        const cancelRequestPromises = [
          page.waitForRequest(
            (req) => req.url().includes('/esql_async') && req.method() === 'DELETE'
          ),
          page.waitForRequest((req) => req.url().includes('/ese') && req.method() === 'DELETE'),
        ];

        await pageObjects.collapsibleNav.clickItem('Discover');

        await Promise.all(cancelRequestPromises);
      }
    );
  }
);
