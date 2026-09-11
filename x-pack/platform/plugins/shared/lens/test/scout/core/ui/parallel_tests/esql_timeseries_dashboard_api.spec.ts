/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DebugState } from '@elastic/charts';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import type { ApiServicesFixture } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

import { spaceTest, testData } from '../fixtures';

const LOGSTASH_ABSOLUTE_RANGE = {
  from: '2015-09-19T06:31:44.000Z',
  to: '2015-09-23T18:31:44.000Z',
} as const;

type EsqlTimeseriesCase = Readonly<{
  description: string;
  query: string;
  xColumn: string;
  yColumn: string;
}>;

const TIMESERIES_CASES: EsqlTimeseriesCase[] = [
  {
    description: 'TBUCKET',
    query: 'FROM logstash-* | STATS count = COUNT(*) BY ts = TBUCKET(50)',
    xColumn: 'ts',
    yColumn: 'count',
  },
  {
    description: 'BUCKET on timestamp',
    query: 'FROM logstash-* | STATS count = COUNT(*) BY ts = BUCKET(@timestamp, 1 hour)',
    xColumn: 'ts',
    yColumn: 'count',
  },
  {
    description: 'DATE_TRUNC on timestamp',
    query: 'FROM logstash-* | STATS count = COUNT(*) BY ts = DATE_TRUNC(1 hour, @timestamp)',
    xColumn: 'ts',
    yColumn: 'count',
  },
];

function buildLensLineTimeseriesPanel(esql: EsqlTimeseriesCase) {
  return {
    type: LENS_EMBEDDABLE_TYPE,
    grid: { x: 0, y: 0, w: 36, h: 20 },
    config: {
      type: 'xy' as const,
      title: `ES|QL ${esql.description}`,
      layers: [
        {
          type: 'line' as const,
          ignore_global_filters: false,
          sampling: 1,
          data_source: {
            type: 'esql' as const,
            query: esql.query,
          },
          x: { column: esql.xColumn },
          y: [{ column: esql.yColumn }],
        },
      ],
    },
  };
}

async function createDashboardWithLensPanel(
  apiServices: ApiServicesFixture,
  spaceId: string,
  title: string,
  esql: EsqlTimeseriesCase
): Promise<string> {
  return apiServices.dashboard.create(
    {
      title,
      time_range: {
        from: LOGSTASH_ABSOLUTE_RANGE.from,
        to: LOGSTASH_ABSOLUTE_RANGE.to,
        mode: 'absolute',
      },
      panels: [buildLensLineTimeseriesPanel(esql)],
    },
    spaceId
  );
}

async function getChartDebugState(
  esqlCase: EsqlTimeseriesCase,
  apiServices: ApiServicesFixture,
  spaceId: string,
  page: import('@kbn/scout').ScoutPage,
  pageObjects: import('@kbn/scout').PageObjects
): Promise<DebugState> {
  const title = `Scout ES|QL timeseries API ${esqlCase.description} ${Date.now()}`;
  const dashboardId = await createDashboardWithLensPanel(apiServices, spaceId, title, esqlCase);

  const { dashboard } = pageObjects;
  await dashboard.openDashboardWithId(dashboardId);
  await dashboard.waitForPanelsToLoad(1);

  const chart = page.testSubj.locator('xyVisChart');
  await chart.locator('.echChartStatus[data-ech-render-complete="true"]').waitFor({
    state: 'attached',
    timeout: 30_000,
  });

  const chartStatus = chart.locator('.echChartStatus');
  const debugJson = await chartStatus.getAttribute('data-ech-debug-state');
  return JSON.parse(debugJson ?? '{}') as DebugState;
}

function areAllEpochMilliseconds(values: unknown[]): boolean {
  return values.every((v) => typeof v === 'number' && v > 1_000_000_000_000);
}

spaceTest.describe(
  'Lens ES|QL timeseries via dashboard API',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.set({
        defaultIndex: testData.DATA_VIEW_ID.LOGSTASH,
        'dateFormat:tz': 'UTC',
        'timepicker:timeDefaults': `{ "from": "${testData.LOGSTASH_IN_RANGE_DATES.from}", "to": "${testData.LOGSTASH_IN_RANGE_DATES.to}"}`,
      });
    });

    spaceTest.beforeEach(async ({ browserAuth, context }) => {
      await browserAuth.loginAsPrivilegedUser();
      await context.addInitScript(() => {
        (window as unknown as { _echDebugStateFlag?: boolean })._echDebugStateFlag = true;
      });
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset('defaultIndex', 'dateFormat:tz', 'timepicker:timeDefaults');
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest(
      'renders a time-scaled x-axis for TBUCKET',
      async ({ apiServices, scoutSpace, page, pageObjects }) => {
        const debug = await getChartDebugState(
          TIMESERIES_CASES[0],
          apiServices,
          scoutSpace.id,
          page,
          pageObjects
        );
        const xAxis = debug.axes?.x?.[0];
        expect(xAxis, 'Expected chart debug state to include an x-axis').toBeDefined();
        const tickValues = xAxis!.values ?? [];
        expect(tickValues.length, 'Expected at least one x-axis tick value').toBeGreaterThan(0);
        expect(
          areAllEpochMilliseconds(tickValues),
          `Expected epoch-ms x-axis ticks; got ${JSON.stringify(tickValues.slice(0, 5))}`
        ).toBe(true);
      }
    );

    spaceTest(
      'renders a time-scaled x-axis for BUCKET on timestamp',
      async ({ apiServices, scoutSpace, page, pageObjects }) => {
        const debug = await getChartDebugState(
          TIMESERIES_CASES[1],
          apiServices,
          scoutSpace.id,
          page,
          pageObjects
        );
        const xAxis = debug.axes?.x?.[0];
        expect(xAxis, 'Expected chart debug state to include an x-axis').toBeDefined();
        const tickValues = xAxis!.values ?? [];
        expect(tickValues.length, 'Expected at least one x-axis tick value').toBeGreaterThan(0);
        expect(
          areAllEpochMilliseconds(tickValues),
          `Expected epoch-ms x-axis ticks; got ${JSON.stringify(tickValues.slice(0, 5))}`
        ).toBe(true);
      }
    );

    spaceTest(
      'renders a time-scaled x-axis for DATE_TRUNC on timestamp',
      async ({ apiServices, scoutSpace, page, pageObjects }) => {
        const debug = await getChartDebugState(
          TIMESERIES_CASES[2],
          apiServices,
          scoutSpace.id,
          page,
          pageObjects
        );
        const xAxis = debug.axes?.x?.[0];
        expect(xAxis, 'Expected chart debug state to include an x-axis').toBeDefined();
        const tickValues = xAxis!.values ?? [];
        expect(tickValues.length, 'Expected at least one x-axis tick value').toBeGreaterThan(0);
        expect(
          areAllEpochMilliseconds(tickValues),
          `Expected epoch-ms x-axis ticks; got ${JSON.stringify(tickValues.slice(0, 5))}`
        ).toBe(true);
      }
    );
  }
);
