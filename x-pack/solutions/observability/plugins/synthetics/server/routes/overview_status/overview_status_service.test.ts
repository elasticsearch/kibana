/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { SavedObjectsFindResult } from '@kbn/core-saved-objects-api-server';
import type { EncryptedSyntheticsMonitorAttributes } from '../../../common/runtime_types';
import {
  HEARTBEAT_UNMAPPED_LOCATION_ID,
  HEARTBEAT_UNMAPPED_LOCATION_LABEL,
} from '../../../common/runtime_types';
import { getUptimeESMockClient } from '../../queries/test_helpers';

import * as allLocationsFn from '../../synthetics_service/get_all_locations';
import {
  HEARTBEAT_MONITORS_OVERVIEW_LIMIT,
  OverviewStatusService,
  SUMMARIES_PAGE_SIZE,
} from './overview_status_service';
import times from 'lodash/times';
import { flatten } from 'lodash';
import moment from 'moment';
const japanLoc = {
  id: 'asia_japan',
  label: 'Asia/Pacific - Japan',
};

const germanyLoc = {
  id: 'europe_germany',
  label: 'Europe - Germany',
};

const allLocations: any = [japanLoc, germanyLoc];
jest.spyOn(allLocationsFn, 'getAllLocations').mockResolvedValue({
  publicLocations: allLocations,
  privateLocations: [],
  allLocations,
});

describe('current status route', () => {
  const testMonitors = [
    {
      attributes: {
        config_id: 'id1',
        id: 'id1',
        type: 'browser',
        enabled: true,
        name: 'test monitor 1',
        project_id: 'project-id',
        tags: ['tag-1', 'tag-2'],
        schedule: {
          number: '1',
          unit: 'm',
        },
        locations: [japanLoc],
      },
    },
    {
      attributes: {
        id: 'id2',
        config_id: 'id2',
        enabled: true,
        type: 'browser',
        name: 'test monitor 2',
        project_id: 'project-id',
        tags: ['tag-1', 'tag-2'],
        schedule: {
          number: '1',
          unit: 'm',
        },
        locations: allLocations,
      },
    },
  ];

  describe('OverviewStatusService', () => {
    it('parses expected agg fields', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: {
                monitorId: 'id1',
                locationId: japanLoc.id,
              },
              status: {
                key: japanLoc.id,
                top: [
                  {
                    metrics: {
                      'monitor.status': 'up',
                    },
                    sort: ['2022-09-15T16:19:16.724Z'],
                  },
                ],
              },
            },
            {
              key: {
                monitorId: 'id2',
                locationId: japanLoc.id,
              },
              status: {
                key: japanLoc.id,
                top: [
                  {
                    metrics: {
                      'monitor.status': 'up',
                    },
                    sort: ['2022-09-15T16:19:16.724Z'],
                  },
                ],
              },
            },
            {
              key: {
                monitorId: 'id2',
                locationId: germanyLoc.id,
              },
              status: {
                key: germanyLoc.id,
                top: [
                  {
                    metrics: {
                      'monitor.status': 'down',
                    },
                    sort: ['2022-09-15T16:19:16.724Z'],
                  },
                ],
              },
            },
          ],
        })
      );
      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue(testMonitors as any);
      expect(await overviewStatusService.getOverviewStatus()).toMatchInlineSnapshot(`
        Object {
          "allIds": Array [
            "id1",
            "id2",
          ],
          "allMonitorsCount": 2,
          "disabledConfigs": Object {},
          "disabledCount": 0,
          "disabledMonitorQueryIds": Array [],
          "disabledMonitorsCount": 0,
          "down": 1,
          "downConfigs": Object {
            "id2": Object {
              "configId": "id2",
              "created_at": undefined,
              "isEnabled": true,
              "isStatusAlertEnabled": false,
              "locations": Array [
                Object {
                  "id": "asia_japan",
                  "label": "Asia/Pacific - Japan",
                  "status": "up",
                },
                Object {
                  "id": "europe_germany",
                  "label": "Europe - Germany",
                  "status": "down",
                },
              ],
              "maintenanceWindows": undefined,
              "monitorQueryId": "id2",
              "name": "test monitor 2",
              "overallStatus": "down",
              "projectId": "project-id",
              "schedule": "1",
              "spaces": undefined,
              "tags": Array [
                "tag-1",
                "tag-2",
              ],
              "timestamp": "2022-09-15T16:19:16.724Z",
              "type": "browser",
              "updated_at": undefined,
              "urls": undefined,
            },
          },
          "enabledMonitorQueryIds": Array [
            "id1",
            "id2",
          ],
          "pending": 0,
          "pendingConfigs": Object {},
          "projectMonitorsCount": 0,
          "stale": 0,
          "staleConfigs": Object {},
          "up": 2,
          "upConfigs": Object {
            "id1": Object {
              "configId": "id1",
              "created_at": undefined,
              "isEnabled": true,
              "isStatusAlertEnabled": false,
              "locations": Array [
                Object {
                  "id": "asia_japan",
                  "label": "Asia/Pacific - Japan",
                  "status": "up",
                },
              ],
              "maintenanceWindows": undefined,
              "monitorQueryId": "id1",
              "name": "test monitor 1",
              "overallStatus": "up",
              "projectId": "project-id",
              "schedule": "1",
              "spaces": undefined,
              "tags": Array [
                "tag-1",
                "tag-2",
              ],
              "timestamp": "2022-09-15T16:19:16.724Z",
              "type": "browser",
              "updated_at": undefined,
              "urls": undefined,
            },
          },
        }
      `);
    });

    it('handles limits with multiple requests', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(
        getEsResponse({
          after: {},
          buckets: flatten(
            times(SUMMARIES_PAGE_SIZE).map(() => [
              {
                key: {
                  monitorId: 'id1',
                  locationId: japanLoc.id,
                },
                status: {
                  key: japanLoc.id,
                  top: [
                    {
                      metrics: {
                        'monitor.status': 'up',
                      },
                      sort: ['2022-09-15T16:19:16.724Z'],
                    },
                  ],
                },
              },
              {
                key: {
                  monitorId: 'id2',
                  locationId: japanLoc.id,
                },
                status: {
                  key: japanLoc.id,
                  top: [
                    {
                      metrics: {
                        'monitor.status': 'up',
                      },
                      sort: ['2022-09-15T16:19:16.724Z'],
                    },
                  ],
                },
              },
              {
                key: {
                  monitorId: 'id2',
                  locationId: germanyLoc.id,
                },
                status: {
                  key: germanyLoc.id,
                  top: [
                    {
                      metrics: {
                        'monitor.status': 'down',
                      },
                      sort: ['2022-09-15T16:19:16.724Z'],
                    },
                  ],
                },
              },
            ])
          ),
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue(testMonitors as any);

      expect(await overviewStatusService.getOverviewStatus()).toMatchInlineSnapshot(`
        Object {
          "allIds": Array [
            "id1",
            "id2",
          ],
          "allMonitorsCount": 2,
          "disabledConfigs": Object {},
          "disabledCount": 0,
          "disabledMonitorQueryIds": Array [],
          "disabledMonitorsCount": 0,
          "down": 1,
          "downConfigs": Object {
            "id2": Object {
              "configId": "id2",
              "created_at": undefined,
              "isEnabled": true,
              "isStatusAlertEnabled": false,
              "locations": Array [
                Object {
                  "id": "asia_japan",
                  "label": "Asia/Pacific - Japan",
                  "status": "up",
                },
                Object {
                  "id": "europe_germany",
                  "label": "Europe - Germany",
                  "status": "down",
                },
              ],
              "maintenanceWindows": undefined,
              "monitorQueryId": "id2",
              "name": "test monitor 2",
              "overallStatus": "down",
              "projectId": "project-id",
              "schedule": "1",
              "spaces": undefined,
              "tags": Array [
                "tag-1",
                "tag-2",
              ],
              "timestamp": "2022-09-15T16:19:16.724Z",
              "type": "browser",
              "updated_at": undefined,
              "urls": undefined,
            },
          },
          "enabledMonitorQueryIds": Array [
            "id1",
            "id2",
          ],
          "pending": 0,
          "pendingConfigs": Object {},
          "projectMonitorsCount": 0,
          "stale": 0,
          "staleConfigs": Object {},
          "up": 2,
          "upConfigs": Object {
            "id1": Object {
              "configId": "id1",
              "created_at": undefined,
              "isEnabled": true,
              "isStatusAlertEnabled": false,
              "locations": Array [
                Object {
                  "id": "asia_japan",
                  "label": "Asia/Pacific - Japan",
                  "status": "up",
                },
              ],
              "maintenanceWindows": undefined,
              "monitorQueryId": "id1",
              "name": "test monitor 1",
              "overallStatus": "up",
              "projectId": "project-id",
              "schedule": "1",
              "spaces": undefined,
              "tags": Array [
                "tag-1",
                "tag-2",
              ],
              "timestamp": "2022-09-15T16:19:16.724Z",
              "type": "browser",
              "updated_at": undefined,
              "urls": undefined,
            },
          },
        }
      `);
      expect(esClient.search).toHaveBeenCalledTimes(2);
    });

    it('handles pending configs', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [],
        })
      );
      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue(testMonitors as any);
      expect(await overviewStatusService.getOverviewStatus()).toMatchInlineSnapshot(`
        Object {
          "allIds": Array [
            "id1",
            "id2",
          ],
          "allMonitorsCount": 2,
          "disabledConfigs": Object {},
          "disabledCount": 0,
          "disabledMonitorQueryIds": Array [],
          "disabledMonitorsCount": 0,
          "down": 0,
          "downConfigs": Object {},
          "enabledMonitorQueryIds": Array [
            "id1",
            "id2",
          ],
          "pending": 2,
          "pendingConfigs": Object {
            "id1": Object {
              "configId": "id1",
              "created_at": undefined,
              "isEnabled": true,
              "isStatusAlertEnabled": false,
              "locations": Array [
                Object {
                  "id": "asia_japan",
                  "label": "Asia/Pacific - Japan",
                  "status": "pending",
                },
              ],
              "maintenanceWindows": undefined,
              "monitorQueryId": "id1",
              "name": "test monitor 1",
              "overallStatus": "pending",
              "projectId": "project-id",
              "schedule": "1",
              "spaces": undefined,
              "tags": Array [
                "tag-1",
                "tag-2",
              ],
              "timestamp": undefined,
              "type": "browser",
              "updated_at": undefined,
              "urls": undefined,
            },
            "id2": Object {
              "configId": "id2",
              "created_at": undefined,
              "isEnabled": true,
              "isStatusAlertEnabled": false,
              "locations": Array [
                Object {
                  "id": "asia_japan",
                  "label": "Asia/Pacific - Japan",
                  "status": "pending",
                },
                Object {
                  "id": "europe_germany",
                  "label": "Europe - Germany",
                  "status": "pending",
                },
              ],
              "maintenanceWindows": undefined,
              "monitorQueryId": "id2",
              "name": "test monitor 2",
              "overallStatus": "pending",
              "projectId": "project-id",
              "schedule": "1",
              "spaces": undefined,
              "tags": Array [
                "tag-1",
                "tag-2",
              ],
              "timestamp": undefined,
              "type": "browser",
              "updated_at": undefined,
              "urls": undefined,
            },
          },
          "projectMonitorsCount": 0,
          "stale": 0,
          "staleConfigs": Object {},
          "up": 0,
          "upConfigs": Object {},
        }
      `);
    });
  });

  describe('processOverviewStatus grouping logic', () => {
    const usLoc = { id: 'us_east', label: 'US East' };
    const euLoc = { id: 'eu_west', label: 'EU West' };
    const apLoc = { id: 'ap_south', label: 'AP South' };

    const makeMonitor = (id: string, locations: any[], enabled = true) => ({
      attributes: {
        config_id: id,
        id,
        type: 'http',
        enabled,
        name: `monitor-${id}`,
        project_id: 'test-project',
        tags: [],
        schedule: { number: '3', unit: 'm' },
        locations,
      },
    });

    it('groups multiple locations under a single configId entry', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'mon1', locationId: usLoc.id },
              status: {
                top: [{ metrics: { 'monitor.status': 'up' }, sort: ['2025-05-28T10:00:00.000Z'] }],
              },
            },
            {
              key: { monitorId: 'mon1', locationId: euLoc.id },
              status: {
                top: [{ metrics: { 'monitor.status': 'up' }, sort: ['2025-05-28T10:01:00.000Z'] }],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest
        .fn()
        .mockResolvedValue([makeMonitor('mon1', [usLoc, euLoc])]);

      const result = await service.getOverviewStatus();

      expect(result.upConfigs.mon1).toBeDefined();
      expect(result.upConfigs.mon1.locations).toHaveLength(2);
      expect(result.upConfigs.mon1.locations[0].id).toBe(usLoc.id);
      expect(result.upConfigs.mon1.locations[1].id).toBe(euLoc.id);
      expect(result.upConfigs.mon1.overallStatus).toBe('up');
    });

    it('classifies a multi-location monitor with any stale location as stale regardless of bucket order', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      // Only the *second*-listed location (eu_west) has a run, and it's stale.
      // The first-listed location (us_east) never ran in the window → pending.
      // This ordering used to leave the monitor stuck in `pending` because the
      // incrementally-built `overallStatus` stayed `pending`; classification
      // must instead inspect the locations so it's deterministic.
      const staleTs = moment().subtract(3, 'hours').toISOString();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'mon1', locationId: euLoc.id },
              status: {
                top: [{ metrics: { 'monitor.status': 'up' }, sort: [staleTs] }],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: { dateRangeStart: 'now-24h', dateRangeEnd: 'now' } },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
          config: { experimental: { ccs: { enabled: false } } },
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest
        .fn()
        .mockResolvedValue([makeMonitor('mon1', [usLoc, euLoc])]);

      const result = await service.getOverviewStatus();

      expect(result.pendingConfigs.mon1).toBeUndefined();
      expect(result.staleConfigs.mon1).toBeDefined();
      expect(result.staleConfigs.mon1.overallStatus).toBe('stale');
      // The stale location carries its last-known status for the "show last run" view.
      const euLocation = result.staleConfigs.mon1.locations.find((l: any) => l.id === euLoc.id);
      expect(euLocation?.status).toBe('stale');
      expect(euLocation?.lastStatus).toBe('up');
      expect(result.stale).toBe(1);
    });

    // Documents the multi-location status precedence: `down > up > stale > pending`.
    // `stale` is only surfaced as a monitor's *overall* status when no location is
    // currently up/down (see the `stale` promotion, which only walks pendingConfigs).
    // So a monitor with at least one fresh `up` location reads as `up` even if another
    // location went stale — the stale location stays visible in `locations`. This is
    // deterministic regardless of the order ES returned the buckets in.
    it.each([
      ['fresh up listed first', 'up_first' as const],
      ['stale listed first', 'stale_first' as const],
    ])(
      'classifies a multi-location monitor as up when any location is fresh up, even with a stale location (%s)',
      async (_label, order) => {
        const { esClient, syntheticsEsClient } = getUptimeESMockClient();
        const freshTs = moment().subtract(2, 'minutes').toISOString();
        const staleTs = moment().subtract(3, 'hours').toISOString();
        const usBucket = {
          key: { monitorId: 'mon1', locationId: usLoc.id },
          status: { top: [{ metrics: { 'monitor.status': 'up' }, sort: [freshTs] }] },
        };
        const euBucket = {
          key: { monitorId: 'mon1', locationId: euLoc.id },
          status: { top: [{ metrics: { 'monitor.status': 'up' }, sort: [staleTs] }] },
        };
        esClient.search.mockResponseOnce(
          getEsResponse({
            buckets: order === 'up_first' ? [usBucket, euBucket] : [euBucket, usBucket],
          })
        );

        const routeContext: any = {
          request: { query: { dateRangeStart: 'now-24h', dateRangeEnd: 'now' } },
          syntheticsEsClient,
          server: {
            isElasticsearchServerless: false,
            config: { experimental: { ccs: { enabled: false } } },
          },
        };
        const service = new OverviewStatusService(routeContext);
        service.getMonitorConfigs = jest
          .fn()
          .mockResolvedValue([makeMonitor('mon1', [usLoc, euLoc])]);

        const result = await service.getOverviewStatus();

        // Overall status is `up`; the monitor is not promoted to stale/pending.
        expect(result.upConfigs.mon1).toBeDefined();
        expect(result.upConfigs.mon1.overallStatus).toBe('up');
        expect(result.staleConfigs.mon1).toBeUndefined();
        expect(result.pendingConfigs.mon1).toBeUndefined();
        expect(result.up).toBe(1);
        expect(result.stale).toBe(0);

        // The stale location is still represented (its dot renders amber) and carries
        // its last-known status, even though the monitor reads as up overall.
        const euLocation = result.upConfigs.mon1.locations.find((l: any) => l.id === euLoc.id);
        expect(euLocation?.status).toBe('stale');
        expect(euLocation?.lastStatus).toBe('up');
      }
    );

    it('sets overallStatus to down when any location is down', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'mon1', locationId: usLoc.id },
              status: {
                top: [{ metrics: { 'monitor.status': 'up' }, sort: ['2025-05-28T10:00:00.000Z'] }],
              },
            },
            {
              key: { monitorId: 'mon1', locationId: euLoc.id },
              status: {
                top: [
                  { metrics: { 'monitor.status': 'down' }, sort: ['2025-05-28T10:01:00.000Z'] },
                ],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest
        .fn()
        .mockResolvedValue([makeMonitor('mon1', [usLoc, euLoc])]);

      const result = await service.getOverviewStatus();

      expect(result.downConfigs.mon1).toBeDefined();
      expect(result.upConfigs.mon1).toBeUndefined();
      expect(result.downConfigs.mon1.overallStatus).toBe('down');
      expect(result.downConfigs.mon1.locations).toHaveLength(2);
      expect(result.downConfigs.mon1.locations.find((l: any) => l.id === usLoc.id)?.status).toBe(
        'up'
      );
      expect(result.downConfigs.mon1.locations.find((l: any) => l.id === euLoc.id)?.status).toBe(
        'down'
      );
    });

    it('moves pending config with a down location to downConfigs', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'mon1', locationId: usLoc.id },
              status: {
                top: [
                  { metrics: { 'monitor.status': 'down' }, sort: ['2025-05-28T10:00:00.000Z'] },
                ],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest
        .fn()
        .mockResolvedValue([makeMonitor('mon1', [usLoc, euLoc, apLoc])]);

      const result = await service.getOverviewStatus();

      expect(result.downConfigs.mon1).toBeDefined();
      expect(result.pendingConfigs.mon1).toBeUndefined();
      expect(result.downConfigs.mon1.locations).toHaveLength(3);
      const pendingLocs = result.downConfigs.mon1.locations.filter(
        (l: any) => l.status === 'pending'
      );
      const downLocs = result.downConfigs.mon1.locations.filter((l: any) => l.status === 'down');
      expect(downLocs).toHaveLength(1);
      expect(pendingLocs).toHaveLength(2);
      // pending locations should be sorted to end
      expect(result.downConfigs.mon1.locations[0].status).toBe('down');
    });

    it('moves pending config with an up location to upConfigs', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'mon1', locationId: usLoc.id },
              status: {
                top: [{ metrics: { 'monitor.status': 'up' }, sort: ['2025-05-28T10:00:00.000Z'] }],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest
        .fn()
        .mockResolvedValue([makeMonitor('mon1', [usLoc, euLoc])]);

      const result = await service.getOverviewStatus();

      expect(result.upConfigs.mon1).toBeDefined();
      expect(result.pendingConfigs.mon1).toBeUndefined();
      expect(result.upConfigs.mon1.overallStatus).toBe('up');
      expect(result.upConfigs.mon1.locations).toHaveLength(2);
      // pending locations sorted to end
      expect(result.upConfigs.mon1.locations[0].status).toBe('up');
      expect(result.upConfigs.mon1.locations[1].status).toBe('pending');
    });

    it('groups disabled monitor locations under a single configId', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(getEsResponse({ buckets: [] }));

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest
        .fn()
        .mockResolvedValue([makeMonitor('mon1', [usLoc, euLoc, apLoc], false)]);

      const result = await service.getOverviewStatus();

      expect(result.disabledConfigs.mon1).toBeDefined();
      expect(result.disabledConfigs.mon1.locations).toHaveLength(3);
      expect(result.disabledConfigs.mon1.overallStatus).toBe('disabled');
      result.disabledConfigs.mon1.locations.forEach((loc: any) => {
        expect(loc.status).toBe('disabled');
      });
    });

    it('uses latest timestamp across locations', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'mon1', locationId: usLoc.id },
              status: {
                top: [{ metrics: { 'monitor.status': 'up' }, sort: ['2025-05-28T09:00:00.000Z'] }],
              },
            },
            {
              key: { monitorId: 'mon1', locationId: euLoc.id },
              status: {
                top: [{ metrics: { 'monitor.status': 'up' }, sort: ['2025-05-28T11:00:00.000Z'] }],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest
        .fn()
        .mockResolvedValue([makeMonitor('mon1', [usLoc, euLoc])]);

      const result = await service.getOverviewStatus();

      expect(result.upConfigs.mon1.timestamp).toBe('2025-05-28T11:00:00.000Z');
    });

    it('handles three locations: up, down, pending correctly', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'mon1', locationId: usLoc.id },
              status: {
                top: [{ metrics: { 'monitor.status': 'up' }, sort: ['2025-05-28T10:00:00.000Z'] }],
              },
            },
            {
              key: { monitorId: 'mon1', locationId: euLoc.id },
              status: {
                top: [
                  { metrics: { 'monitor.status': 'down' }, sort: ['2025-05-28T10:01:00.000Z'] },
                ],
              },
            },
            // apLoc has no status data -> pending
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest
        .fn()
        .mockResolvedValue([makeMonitor('mon1', [usLoc, euLoc, apLoc])]);

      const result = await service.getOverviewStatus();

      expect(result.downConfigs.mon1).toBeDefined();
      expect(result.upConfigs.mon1).toBeUndefined();
      expect(result.downConfigs.mon1.overallStatus).toBe('down');
      expect(result.downConfigs.mon1.locations).toHaveLength(3);
      expect(result.downConfigs.mon1.locations.find((l: any) => l.id === usLoc.id)?.status).toBe(
        'up'
      );
      expect(result.downConfigs.mon1.locations.find((l: any) => l.id === euLoc.id)?.status).toBe(
        'down'
      );
      expect(result.downConfigs.mon1.locations.find((l: any) => l.id === apLoc.id)?.status).toBe(
        'pending'
      );
    });
  });

  describe('getStatus', () => {
    jest.spyOn(allLocationsFn, 'getAllLocations').mockResolvedValue({
      publicLocations: allLocations,
      privateLocations: [],
      allLocations: [
        {
          id: 'us_central_qa',
          label: 'US Central QA',
        },
        {
          id: 'us_central',
          label: 'North America - US Central',
        },
      ] as any,
    });

    it.each([
      [['US Central QA'], 1],
      [['North America - US Central'], 1],
      [['North America - US Central', 'US Central QA'], 2],
      [undefined, 2],
    ])('handles disabled count when using location filters', async (locations, disabledCount) => {
      const getAll = jest.fn().mockResolvedValue([
        {
          type: 'synthetics-monitor',
          id: 'a9a94f2f-47ba-4fe2-afaa-e5cd29b281f1',
          attributes: {
            enabled: false,
            schedule: {
              number: '3',
              unit: 'm',
            },
            config_id: 'a9a94f2f-47ba-4fe2-afaa-e5cd29b281f1',
            locations: [
              {
                isServiceManaged: true,
                label: 'US Central QA',
                id: 'us_central_qa',
              },
              {
                isServiceManaged: true,
                label: 'North America - US Central',
                id: 'us_central',
              },
            ],
            origin: 'project',
            id: 'a-test2-default',
          },
          references: [],
          migrationVersion: {
            'synthetics-monitor': '8.6.0',
          },
          coreMigrationVersion: '8.0.0',
          updated_at: '2023-02-28T14:31:37.641Z',
          created_at: '2023-02-28T14:31:37.641Z',
          version: 'Wzg0MzkzLDVd',
          namespaces: ['default'],
          score: null,
          sort: ['a', 3013],
        } as unknown as SavedObjectsFindResult<EncryptedSyntheticsMonitorAttributes>,
      ]);
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.msearch.mockResponseOnce({
        responses: [
          getEsResponse({
            buckets: [
              {
                key: 'id1',
                location: {
                  buckets: [
                    {
                      key: 'Asia/Pacific - Japan',
                      status: {
                        hits: {
                          hits: [
                            {
                              _source: {
                                '@timestamp': '2022-09-15T16:08:16.724Z',
                                monitor: {
                                  status: 'up',
                                  id: 'id1',
                                },
                                summary: {
                                  up: 1,
                                  down: 0,
                                },
                                config_id: 'id1',
                                observer: {
                                  geo: {
                                    name: 'Asia/Pacific - Japan',
                                  },
                                },
                              },
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
              {
                key: 'id2',
                location: {
                  buckets: [
                    {
                      key: 'Asia/Pacific - Japan',
                      status: {
                        hits: {
                          hits: [
                            {
                              _source: {
                                '@timestamp': '2022-09-15T16:09:16.724Z',
                                monitor: {
                                  status: 'up',
                                  id: 'id2',
                                },
                                summary: {
                                  up: 1,
                                  down: 0,
                                },
                                config_id: 'id2',
                                observer: {
                                  geo: {
                                    name: 'Asia/Pacific - Japan',
                                  },
                                },
                              },
                            },
                          ],
                        },
                      },
                    },
                    {
                      key: 'Europe - Germany',
                      status: {
                        hits: {
                          hits: [
                            {
                              _source: {
                                '@timestamp': '2022-09-15T16:19:16.724Z',
                                monitor: {
                                  status: 'down',
                                  id: 'id2',
                                },
                                summary: {
                                  down: 1,
                                  up: 0,
                                },
                                config_id: 'id2',
                                observer: {
                                  geo: {
                                    name: 'Europe - Germany',
                                  },
                                },
                              },
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            ],
          }),
        ],
        took: 605,
      });

      const overviewStatusService = new OverviewStatusService({
        request: {
          query: {
            locations,
          },
        },
        syntheticsEsClient,
        monitorConfigRepository: {
          getAll,
        },
        server: {
          isElasticsearchServerless: false,
        },
      } as any);

      const result = await overviewStatusService.getOverviewStatus();

      expect(result).toEqual(
        expect.objectContaining({
          disabledCount,
        })
      );
    });

    it.each([
      [['US Central QA'], 1],
      [['North America - US Central'], 1],
      [['North America - US Central', 'US Central QA'], 1],
      [undefined, 1],
    ])('handles pending count when using location filters', async (locations, pending) => {
      const getAll = jest.fn().mockResolvedValue([
        {
          type: 'synthetics-monitor',
          id: 'a9a94f2f-47ba-4fe2-afaa-e5cd29b281f1',
          attributes: {
            enabled: true,
            schedule: {
              number: '3',
              unit: 'm',
            },
            config_id: 'a9a94f2f-47ba-4fe2-afaa-e5cd29b281f1',
            locations: [
              {
                isServiceManaged: true,
                label: 'US Central QA',
                id: 'us_central_qa',
              },
              {
                isServiceManaged: true,
                label: 'North America - US Central',
                id: 'us_central',
              },
            ],
            origin: 'project',
            id: 'a-test2-default',
          },
          references: [],
          migrationVersion: {
            'synthetics-monitor': '8.6.0',
          },
          coreMigrationVersion: '8.0.0',
          updated_at: '2023-02-28T14:31:37.641Z',
          created_at: '2023-02-28T14:31:37.641Z',
          version: 'Wzg0MzkzLDVd',
          namespaces: ['default'],
          score: null,
          sort: ['a', 3013],
        } as unknown as SavedObjectsFindResult<EncryptedSyntheticsMonitorAttributes>,
      ]);
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [],
        })
      );

      const overviewStatusService = new OverviewStatusService({
        request: {
          query: {
            locations,
          },
        },
        syntheticsEsClient,
        monitorConfigRepository: {
          getAll,
        },
        server: {
          isElasticsearchServerless: false,
        },
      } as any);

      const result = await overviewStatusService.getOverviewStatus();

      expect(result.pending).toEqual(pending);
    });
  });

  describe('error reason and downSince enrichment', () => {
    it('attaches error + downSince to down locations and omits them on up locations', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'id1', locationId: japanLoc.id },
              status: {
                top: [{ metrics: { 'monitor.status': 'up' }, sort: ['2025-05-28T10:00:00.000Z'] }],
              },
              // Up bucket: filter > top_hits short-circuits with no hits.
              errorAndState: { doc_count: 0, latest: { hits: { hits: [] } } },
            },
            {
              key: { monitorId: 'id2', locationId: japanLoc.id },
              status: {
                top: [{ metrics: { 'monitor.status': 'up' }, sort: ['2025-05-28T10:00:00.000Z'] }],
              },
              errorAndState: { doc_count: 0, latest: { hits: { hits: [] } } },
            },
            {
              key: { monitorId: 'id2', locationId: germanyLoc.id },
              status: {
                top: [
                  { metrics: { 'monitor.status': 'down' }, sort: ['2025-05-28T10:00:00.000Z'] },
                ],
              },
              errorAndState: {
                doc_count: 1,
                latest: {
                  hits: {
                    hits: [
                      {
                        _source: {
                          error: { message: 'TLS handshake failed', type: 'io' },
                          state: { started_at: '2025-05-28T09:30:00.000Z' },
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };
      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue(testMonitors as any);

      const result = await overviewStatusService.getOverviewStatus();

      // id1 (single up location) — error/downSince must be stripped even if
      // the latest summary doc still carries legacy state info.
      const upMonitor = result.upConfigs.id1;
      expect(upMonitor.locations).toEqual([
        { id: japanLoc.id, label: japanLoc.label, status: 'up' },
      ]);

      // id2 has up (japan) + down (germany). Post-processing moves it to
      // downConfigs because at least one location is down.
      const mixedMonitor = result.downConfigs.id2;
      expect(mixedMonitor).toBeDefined();
      expect(mixedMonitor.overallStatus).toBe('down');
      expect(mixedMonitor.locations).toEqual([
        { id: japanLoc.id, label: japanLoc.label, status: 'up' },
        {
          id: germanyLoc.id,
          label: germanyLoc.label,
          status: 'down',
          downSince: '2025-05-28T09:30:00.000Z',
          error: { message: 'TLS handshake failed', type: 'io' },
        },
      ]);
    });
  });
  describe('CCS remote decoration', () => {
    it('populates remote field when CCS is enabled and _index is from a remote cluster', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: {
                monitorId: 'id1',
                locationId: japanLoc.id,
              },
              status: {
                key: japanLoc.id,
                top: [
                  {
                    metrics: {
                      'monitor.status': 'up',
                      kibanaUrl: 'https://west.kibana.example.com',
                      _index: 'cluster-west:synthetics-browser-default',
                    },
                    sort: ['2022-09-15T16:19:16.724Z'],
                  },
                ],
              },
            },
            {
              key: {
                monitorId: 'id2',
                locationId: japanLoc.id,
              },
              status: {
                key: japanLoc.id,
                top: [
                  {
                    metrics: {
                      'monitor.status': 'up',
                    },
                    sort: ['2022-09-15T16:19:16.724Z'],
                  },
                ],
              },
            },
            {
              key: {
                monitorId: 'id2',
                locationId: germanyLoc.id,
              },
              status: {
                key: germanyLoc.id,
                top: [
                  {
                    metrics: {
                      'monitor.status': 'down',
                    },
                    sort: ['2022-09-15T16:19:16.724Z'],
                  },
                ],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue(testMonitors as any);

      const result = await overviewStatusService.getOverviewStatus();

      // Remote monitor should have remote field populated.
      // id1 has a single location (japan) coming from a remote cluster.
      expect(result.upConfigs.id1).toBeDefined();
      expect(result.upConfigs.id1.remote).toEqual({
        remoteName: 'cluster-west',
        kibanaUrl: 'https://west.kibana.example.com',
      });

      // id2 has two locations (japan up, germany down) sourced from local
      // indices, so the monitor lands in downConfigs and has no remote info.
      expect(result.upConfigs.id2).toBeUndefined();
      expect(result.downConfigs.id2).toBeDefined();
      expect(result.downConfigs.id2.remote).toBeUndefined();
    });

    it('discovers remote-only monitors that have no local saved object', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            // Local monitor (has saved object)
            {
              key: {
                monitorId: 'id1',
                locationId: japanLoc.id,
              },
              status: {
                key: japanLoc.id,
                top: [
                  {
                    metrics: {
                      'monitor.status': 'up',
                    },
                    sort: ['2022-09-15T16:19:16.724Z'],
                  },
                ],
              },
            },
            // Remote-only monitor (NO local saved object)
            {
              key: {
                monitorId: 'remote-monitor-1',
                locationId: 'us-east-1',
              },
              status: {
                key: 'us-east-1',
                top: [
                  {
                    metrics: {
                      'monitor.status': 'down',
                      kibanaUrl: 'https://east.kibana.example.com',
                      'monitor.name': 'Remote API Check',
                      'monitor.type': 'http',
                      config_id: 'remote-config-1',
                      _index: 'cluster-east:synthetics-browser-default',
                    },
                    sort: ['2022-09-15T16:20:00.000Z'],
                  },
                ],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue(testMonitors as any);

      const result = await overviewStatusService.getOverviewStatus();

      // Remote-only monitor should appear in downConfigs with metadata from ping fields.
      // The bucket key is `${remoteName}-${configId}-${locationId}` to prevent
      // cross-cluster collisions for the same monitor.
      const remoteDown = result.downConfigs['cluster-east-remote-config-1-us-east-1'];
      expect(remoteDown).toBeDefined();
      expect(remoteDown.name).toBe('Remote API Check');
      expect(remoteDown.type).toBe('http');
      expect(remoteDown.configId).toBe('remote-config-1');
      expect(remoteDown.locations).toHaveLength(1);
      expect(remoteDown.locations[0].id).toBe('us-east-1');
      expect(remoteDown.locations[0].label).toBe('us-east-1');
      expect(remoteDown.locations[0].status).toBe('down');
      expect(remoteDown.remote).toEqual({
        remoteName: 'cluster-east',
        kibanaUrl: 'https://east.kibana.example.com',
      });

      // Counts should include the remote monitor
      expect(result.down).toBe(1);
      expect(result.up).toBe(1);
    });

    it('discovers CPS linked-project monitors that have no local saved object', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: {
                monitorId: 'linked-monitor-1',
                locationId: 'us-west-1',
              },
              status: {
                key: 'us-west-1',
                top: [
                  {
                    metrics: {
                      'monitor.status': 'up',
                      'monitor.name': 'Linked HTTP check',
                      'monitor.type': 'http',
                      config_id: 'linked-config-1',
                      _index: 'obs-prod:.ds-synthetics-http-default-2026.01.01-000001',
                    },
                    sort: ['2022-09-15T16:20:00.000Z'],
                  },
                ],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: true,
          isCpsEnabled: true,
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue([]);

      const result = await overviewStatusService.getOverviewStatus();

      const linked = result.upConfigs['obs-prod-linked-config-1-us-west-1'];
      expect(linked).toBeDefined();
      expect(linked.name).toBe('Linked HTTP check');
      expect(linked.remote).toEqual({ remoteName: 'obs-prod' });
      expect(result.up).toBe(1);
    });

    it('collects _index and applies remoteNames on serverless when CPS is on', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(getEsResponse({ buckets: [] }));

      const routeContext: any = {
        request: { query: { remoteNames: ['obs-prod'] } },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: true,
          isCpsEnabled: true,
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue([]);

      await overviewStatusService.getOverviewStatus();

      const searchCall = esClient.search.mock.calls[0][0] as any;
      const metricFields = searchCall.aggs.monitors.aggs.status.top_metrics.metrics.map(
        (m: { field: string }) => m.field
      );
      expect(metricFields).toContain('_index');
      expect(searchCall.aggs.monitors.aggs.index_name).toBeUndefined();
      const filters = searchCall.query.bool.filter;
      const remoteFilter = filters.find((f: any) =>
        f.bool?.should?.some((s: any) => s.wildcard?._index === 'obs-prod:*')
      );
      expect(remoteFilter).toBeDefined();
    });

    it('does not collect _index or apply remoteNames on serverless when CPS is off', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(getEsResponse({ buckets: [] }));

      const routeContext: any = {
        request: { query: { remoteNames: ['obs-prod'] } },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: true,
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue([]);

      await overviewStatusService.getOverviewStatus();

      const searchCall = esClient.search.mock.calls[0][0] as any;
      const metricFields = searchCall.aggs.monitors.aggs.status.top_metrics.metrics.map(
        (m: { field: string }) => m.field
      );
      expect(metricFields).not.toContain('_index');
      expect(searchCall.aggs.monitors.aggs.index_name).toBeUndefined();
      const filters = searchCall.query.bool.filter ?? [];
      const remoteFilter = filters.find((f: any) =>
        f.bool?.should?.some((s: any) => s.wildcard?._index === 'obs-prod:*')
      );
      expect(remoteFilter).toBeUndefined();
    });

    it('keeps two remote monitors with the same configId+locationId from different clusters', async () => {
      // Regression: two remote clusters can host the same imported monitor in
      // the same locationId. Before keying the bucket by remoteName the second
      // ping silently overwrote the first because the in-memory key collided.
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: {
                monitorId: 'shared-remote-monitor',
                locationId: 'us-east-1',
              },
              status: {
                key: 'us-east-1',
                top: [
                  {
                    metrics: {
                      'monitor.status': 'down',
                      kibanaUrl: 'https://east.kibana.example.com',
                      'monitor.name': 'Shared Remote Check',
                      'monitor.type': 'http',
                      config_id: 'shared-config',
                      _index: 'cluster-east:synthetics-http-default',
                    },
                    sort: ['2022-09-15T16:20:00.000Z'],
                  },
                ],
              },
            },
            {
              key: {
                monitorId: 'shared-remote-monitor',
                locationId: 'us-east-1',
              },
              status: {
                key: 'us-east-1',
                top: [
                  {
                    metrics: {
                      'monitor.status': 'up',
                      kibanaUrl: 'https://west.kibana.example.com',
                      'monitor.name': 'Shared Remote Check',
                      'monitor.type': 'http',
                      config_id: 'shared-config',
                      _index: 'cluster-west:synthetics-http-default',
                    },
                    sort: ['2022-09-15T16:21:00.000Z'],
                  },
                ],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue([] as any);

      const result = await overviewStatusService.getOverviewStatus();

      const fromEast = result.downConfigs['cluster-east-shared-config-us-east-1'];
      const fromWest = result.upConfigs['cluster-west-shared-config-us-east-1'];

      expect(fromEast).toBeDefined();
      expect(fromEast.remote).toEqual({
        remoteName: 'cluster-east',
        kibanaUrl: 'https://east.kibana.example.com',
      });
      expect(fromWest).toBeDefined();
      expect(fromWest.remote).toEqual({
        remoteName: 'cluster-west',
        kibanaUrl: 'https://west.kibana.example.com',
      });
      expect(result.down).toBe(1);
      expect(result.up).toBe(1);
    });

    it('does not place a local no-saved-object ping into the remote branch', async () => {
      // A local ping (no cluster-alias prefix on `_index`) with no saved object
      // must never be decorated with `remote` info — it is not a CCS monitor.
      // It is instead surfaced through the Heartbeat branch (covered in the
      // "Heartbeat / Elastic Agent managed monitors" suite). Cross-space safety
      // is enforced at query time via the `meta.space_id` filter applied to all
      // pings, not by dropping local no-SO pings here.
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: {
                monitorId: 'local-no-so',
                locationId: japanLoc.id,
              },
              status: {
                key: japanLoc.id,
                top: [
                  {
                    metrics: {
                      'monitor.status': 'down',
                      'monitor.name': 'Local No SO Monitor',
                      'monitor.type': 'http',
                      _index: 'synthetics-http-default',
                    },
                    sort: ['2022-09-15T16:20:00.000Z'],
                  },
                ],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        spaceId: 'default',
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue([] as any);

      const result = await overviewStatusService.getOverviewStatus();

      const entry = result.downConfigs['heartbeat-local-no-so-asia_japan'];
      expect(entry).toBeDefined();
      expect(entry.remote).toBeUndefined();
      expect(entry.origin).toBe('heartbeat');
    });

    it('applies the same meta.space_id filter to local and remote pings when CCS is enabled', async () => {
      // both local pings and remote pings carry `meta.space_id`
      // we only surface the ones whose space slug matches the active local space (plus `*`)
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: {
                monitorId: 'id1',
                locationId: japanLoc.id,
              },
              status: {
                key: japanLoc.id,
                top: [
                  {
                    metrics: {
                      'monitor.status': 'up',
                    },
                    sort: ['2022-09-15T16:19:16.724Z'],
                  },
                ],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        spaceId: 'default',
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue(testMonitors as any);

      await overviewStatusService.getOverviewStatus();

      const searchCall = esClient.search.mock.calls[0][0] as any;
      const filters = searchCall.query.bool.filter;

      const spaceFilter = filters.find((f: any) =>
        f.bool?.should?.some((s: any) => s.terms?.['meta.space_id'])
      );
      expect(spaceFilter).toBeDefined();
      const spaceTerms = spaceFilter.bool.should.find((s: any) => s.terms?.['meta.space_id']);
      expect(spaceTerms.terms['meta.space_id']).toEqual(['default', '*']);
      // Space-less autodiscovery pings are always included.
      expect(spaceFilter.bool.should).toContainEqual({
        bool: { must_not: { exists: { field: 'meta.space_id' } } },
      });

      const splitFilter = filters.find(
        (f: any) =>
          f.bool?.should?.some((s: any) => s.terms?.['meta.space_id']) &&
          f.bool?.should?.some((s: any) => s.wildcard?._index)
      );
      expect(splitFilter).toBeUndefined();
    });

    it("does not surface a remote ping from another local space (meta.space_id: 'production') when the active space is 'default'", async () => {
      // a remote ping with meta.space_id: 'production' and a 'default' local space is not shown in the overview
      // because the ES query filter on `meta.space_id: ['default', '*']` drops it at filter time
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(getEsResponse({ buckets: [] }));

      const routeContext: any = {
        request: { query: {} },
        spaceId: 'default',
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue([] as any);

      const result = await overviewStatusService.getOverviewStatus();

      const searchCall = esClient.search.mock.calls[0][0] as any;
      const filters = searchCall.query.bool.filter;
      const spaceFilter = filters.find((f: any) =>
        f.bool?.should?.some((s: any) => s.terms?.['meta.space_id'])
      );
      expect(spaceFilter).toBeDefined();
      const spaceTerms = spaceFilter.bool.should.find((s: any) => s.terms?.['meta.space_id']);
      expect(spaceTerms.terms['meta.space_id']).toEqual(['default', '*']);
      expect(spaceTerms.terms['meta.space_id']).not.toContain('production');

      expect(result.down).toBe(0);
      expect(result.up).toBe(0);
      expect(result.pending).toBe(0);
      expect(Object.keys(result.downConfigs)).toHaveLength(0);
      expect(Object.keys(result.upConfigs)).toHaveLength(0);
      expect(Object.keys(result.pendingConfigs)).toHaveLength(0);
    });

    it('ties remote pings to the active space but leaves local pings unconstrained when showFromAllSpaces is on and the user lacks all-spaces access', async () => {
      // "All permitted spaces" without `*` read access: local pings are bounded
      // by the saved-object join (so they need no `meta.space_id` filter), while
      // remote pings — which have no saved object to join against — must stay
      // tied to the active space so they can't leak in from other spaces.
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(getEsResponse({ buckets: [] }));

      const routeContext: any = {
        request: { query: { showFromAllSpaces: true } },
        spaceId: 'default',
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
          security: {
            authz: {
              mode: { useRbacForRequest: () => true },
              actions: { api: { get: (tag: string) => `api:${tag}` } },
              checkPrivilegesWithRequest: () => ({
                globally: async () => ({ hasAllRequested: false }),
              }),
            },
          },
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue([] as any);

      await overviewStatusService.getOverviewStatus();

      const searchCall = esClient.search.mock.calls[0][0] as any;
      const filters = searchCall.query.bool.filter;

      // No top-level plain space terms — the scoping is now split local vs remote.
      const plainSpaceFilter = filters.find((f: any) => f.terms && f.terms['meta.space_id']);
      expect(plainSpaceFilter).toBeUndefined();

      const splitFilter = filters.find(
        (f: any) => f.bool?.minimum_should_match === 1 && f.bool?.should
      );
      expect(splitFilter).toBeDefined();

      // Local branch: any local ping (no cluster-alias prefix in `_index`).
      const localBranch = splitFilter.bool.should.find((s: any) => s.bool?.must_not);
      expect(localBranch.bool.must_not).toEqual([{ wildcard: { _index: '*:*' } }]);

      // Remote branch: remote pings tied to the active space (+ `*`).
      const remoteBranch = splitFilter.bool.should.find((s: any) =>
        s.bool?.filter?.some((c: any) => c.wildcard?._index)
      );
      expect(remoteBranch.bool.filter).toEqual(
        expect.arrayContaining([
          { wildcard: { _index: '*:*' } },
          {
            bool: {
              minimum_should_match: 1,
              should: [
                { terms: { 'meta.space_id': ['default', '*'] } },
                { bool: { must_not: { exists: { field: 'meta.space_id' } } } },
              ],
            },
          },
        ])
      );
    });

    it('drops space scoping and surfaces remote pings from every space when the user can read synthetics in all spaces', async () => {
      // A user permitted to read synthetics in all spaces sees remote monitors
      // from every space, so no `meta.space_id` constraint is applied at all.
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'remote-prod-monitor', locationId: 'us-east-1' },
              status: {
                key: 'us-east-1',
                top: [
                  {
                    metrics: {
                      'monitor.status': 'down',
                      kibanaUrl: 'https://east.kibana.example.com',
                      'monitor.name': 'Remote Prod Check',
                      'monitor.type': 'http',
                      config_id: 'remote-prod-config',
                      _index: 'cluster-east:synthetics-http-production',
                    },
                    sort: ['2022-09-15T16:20:00.000Z'],
                  },
                ],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: { showFromAllSpaces: true } },
        spaceId: 'default',
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
          security: {
            authz: {
              mode: { useRbacForRequest: () => true },
              actions: { api: { get: (tag: string) => `api:${tag}` } },
              checkPrivilegesWithRequest: () => ({
                globally: async () => ({ hasAllRequested: true }),
              }),
            },
          },
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue([] as any);

      const result = await overviewStatusService.getOverviewStatus();

      const searchCall = esClient.search.mock.calls[0][0] as any;
      const filters = searchCall.query.bool.filter;

      // No space scoping at all (neither plain terms nor a local/remote split).
      const anySpaceScoping = filters.find((f: any) => JSON.stringify(f).includes('meta.space_id'));
      expect(anySpaceScoping).toBeUndefined();

      // The remote ping from `production` is surfaced.
      const remoteDown = result.downConfigs['cluster-east-remote-prod-config-us-east-1'];
      expect(remoteDown).toBeDefined();
      expect(remoteDown.remote).toEqual({
        remoteName: 'cluster-east',
        kibanaUrl: 'https://east.kibana.example.com',
      });
      expect(result.down).toBe(1);
    });

    it('treats a non-RBAC request as having all-spaces access (no space scoping)', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(getEsResponse({ buckets: [] }));

      const routeContext: any = {
        request: { query: { showFromAllSpaces: true } },
        spaceId: 'default',
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
          security: {
            authz: {
              mode: { useRbacForRequest: () => false },
              actions: { api: { get: (tag: string) => `api:${tag}` } },
              checkPrivilegesWithRequest: () => ({
                globally: async () => ({ hasAllRequested: false }),
              }),
            },
          },
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue([] as any);

      await overviewStatusService.getOverviewStatus();

      const searchCall = esClient.search.mock.calls[0][0] as any;
      const filters = searchCall.query.bool.filter;
      const anySpaceScoping = filters.find((f: any) => JSON.stringify(f).includes('meta.space_id'));
      expect(anySpaceScoping).toBeUndefined();
    });

    it('includes simple_query_string filter when query param is provided', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'id1', locationId: japanLoc.id },
              status: {
                key: japanLoc.id,
                top: [{ metrics: { 'monitor.status': 'up' }, sort: ['2022-09-15T16:19:16.724Z'] }],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: { query: '"Observability UI"' } },
        spaceId: 'default',
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue(testMonitors as any);

      await overviewStatusService.getOverviewStatus();

      const searchCall = esClient.search.mock.calls[0][0] as any;
      const filters = searchCall.query.bool.filter;
      const queryFilter = filters.find((f: any) => f.simple_query_string);
      expect(queryFilter).toBeDefined();
      expect(queryFilter.simple_query_string.query).toBe('"Observability UI"');
      // Must stay aligned with the saved-object search fields (MONITOR_SEARCH_FIELDS)
      // so a monitor matched by the list query keeps its ping/status data.
      expect(queryFilter.simple_query_string.fields).toEqual([
        'monitor.name',
        'monitor.name.text',
        'tags',
        'observer.name',
        'observer.geo.name',
        'urls',
        'hosts',
        'url.full',
        'url.domain',
        'monitor.project.id',
      ]);
    });

    it('does not include simple_query_string filter when query param is absent', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'id1', locationId: japanLoc.id },
              status: {
                key: japanLoc.id,
                top: [{ metrics: { 'monitor.status': 'up' }, sort: ['2022-09-15T16:19:16.724Z'] }],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        spaceId: 'default',
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue(testMonitors as any);

      await overviewStatusService.getOverviewStatus();

      const searchCall = esClient.search.mock.calls[0][0] as any;
      const filters = searchCall.query.bool.filter;
      const queryFilter = filters.find((f: any) => f.simple_query_string);
      expect(queryFilter).toBeUndefined();
    });

    it('skips CCS-only aggregations and decoration on serverless', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: {
                monitorId: 'id1',
                locationId: japanLoc.id,
              },
              status: {
                key: japanLoc.id,
                top: [
                  {
                    metrics: {
                      'monitor.status': 'up',
                    },
                    sort: ['2022-09-15T16:19:16.724Z'],
                  },
                ],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        spaceId: 'default',
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: true,
        },
      };

      const overviewStatusService = new OverviewStatusService(routeContext);
      overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue(testMonitors as any);

      const result = await overviewStatusService.getOverviewStatus();

      // Active-space filter is still applied (single-space view). `_index`
      // collection is CPS-gated, so it stays off when `isCpsEnabled` is unset.
      const searchCall = esClient.search.mock.calls[0][0] as any;
      const filters = searchCall.query.bool.filter;
      const spaceFilter = filters.find((f: any) =>
        f.bool?.should?.some((s: any) => s.terms?.['meta.space_id'])
      );
      expect(spaceFilter).toBeDefined();
      const spaceTerms = spaceFilter.bool.should.find((s: any) => s.terms?.['meta.space_id']);
      expect(spaceTerms.terms['meta.space_id']).toContain('default');

      const monitorAggs = searchCall.aggs.monitors.aggs;
      const metricFields = monitorAggs.status.top_metrics.metrics.map(
        (m: { field: string }) => m.field
      );
      expect(metricFields).not.toContain('_index');
      expect(monitorAggs.index_name).toBeUndefined();
      // `location_name` resolves the human-readable observer.geo.name label for
      // external monitors (remote CCS + local Heartbeat) that carry a location.
      // Heartbeat detection is always-on, so it runs even on serverless (unlike
      // CCS/CPS-gated `_index` on top_metrics). Location-less pings don't rely
      // on it — they fall back to the placeholder label.
      expect(monitorAggs.location_name).toBeDefined();
      // `space_id` presence tells a deleted Kibana monitor's leftover pings
      // (always stamped with `meta.space_id`) apart from autodiscovery pings.
      // Heartbeat detection is always-on, so it runs even on serverless.
      expect(monitorAggs.space_id).toBeDefined();

      // No remote decoration without CCS.
      expect(result.upConfigs.id1).toBeDefined();
      expect(result.upConfigs.id1.remote).toBeUndefined();
    });

    describe('date range window', () => {
      // Only `id1` reports a final summary; `id2` has no bucket in the window.
      const onlyId1Buckets = [
        {
          key: { monitorId: 'id1', locationId: japanLoc.id },
          status: {
            key: japanLoc.id,
            top: [{ metrics: { 'monitor.status': 'up' }, sort: ['2022-09-15T16:19:16.724Z'] }],
          },
        },
      ];

      const buildRouteContext = (query: Record<string, any>, syntheticsEsClient?: any): any => ({
        request: { query },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
          config: { experimental: { ccs: { enabled: false } } },
        },
      });

      describe('getStatusQueryRange', () => {
        const DEFAULT_LOOKBACK_TOLERANCE_SECONDS = 5;

        const expectDefaultWindow = (range: { from: string; to: string }) => {
          expect(range.to).toBe('now');
          const expectedFrom = moment().subtract(4, 'hours').subtract(20, 'minutes');
          expect(Math.abs(moment(range.from).diff(expectedFrom, 'seconds'))).toBeLessThanOrEqual(
            DEFAULT_LOOKBACK_TOLERANCE_SECONDS
          );
        };

        it('falls back to the default 4h20m look-back window when no range is provided', () => {
          const service = new OverviewStatusService(buildRouteContext({}));
          expectDefaultWindow(service.getStatusQueryRange());
        });

        it('honors the picker window when a valid range is provided', () => {
          const service = new OverviewStatusService(
            buildRouteContext({
              dateRangeStart: '2022-01-01T00:00:00.000Z',
              dateRangeEnd: '2022-01-02T00:00:00.000Z',
            })
          );
          expect(service.getStatusQueryRange()).toEqual({
            from: '2022-01-01T00:00:00.000Z',
            to: '2022-01-02T00:00:00.000Z',
          });
        });

        it('falls back to the default window when only one bound is provided', () => {
          const service = new OverviewStatusService(
            buildRouteContext({ dateRangeStart: 'now-15m' })
          );
          expectDefaultWindow(service.getStatusQueryRange());
        });

        it('falls back to the default window when datemath cannot parse the bounds', () => {
          const service = new OverviewStatusService(
            buildRouteContext({
              dateRangeStart: 'not-a-date',
              dateRangeEnd: 'also-bad',
            })
          );
          expectDefaultWindow(service.getStatusQueryRange());
        });
      });

      it('keeps monitors with no summary in the window, surfacing them as pending', async () => {
        const { esClient, syntheticsEsClient } = getUptimeESMockClient();
        esClient.search.mockResponseOnce(getEsResponse({ buckets: onlyId1Buckets }));

        const overviewStatusService = new OverviewStatusService(
          buildRouteContext(
            {
              dateRangeStart: '2022-09-01T00:00:00.000Z',
              dateRangeEnd: '2022-09-30T00:00:00.000Z',
            },
            syntheticsEsClient
          )
        );
        overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue(testMonitors as any);

        const result = await overviewStatusService.getOverviewStatus();

        // id2 never reported in the window, so it stays in the list as pending
        // rather than being dropped — the overview never hides a configured monitor.
        expect(result.allMonitorsCount).toBe(2);
        expect(result.allIds).toEqual(expect.arrayContaining(['id1', 'id2']));
        expect(result.upConfigs.id1).toBeDefined();
        expect(result.pendingConfigs.id2).toBeDefined();
      });

      it('keeps every configured monitor when no range is provided (current-status snapshot)', async () => {
        const { esClient, syntheticsEsClient } = getUptimeESMockClient();
        esClient.search.mockResponseOnce(getEsResponse({ buckets: onlyId1Buckets }));

        const overviewStatusService = new OverviewStatusService(
          buildRouteContext({}, syntheticsEsClient)
        );
        overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue(testMonitors as any);

        const result = await overviewStatusService.getOverviewStatus();

        expect(result.allMonitorsCount).toBe(2);
        expect(result.allIds).toEqual(expect.arrayContaining(['id1', 'id2']));
        expect(result.pendingConfigs.id2).toBeDefined();
      });

      describe('freshness guard', () => {
        const id1BucketAt = (timestamp: string, status = 'up') => [
          {
            key: { monitorId: 'id1', locationId: japanLoc.id },
            status: {
              key: japanLoc.id,
              top: [{ metrics: { 'monitor.status': status }, sort: [timestamp] }],
            },
          },
        ];

        describe('shouldApplyFreshnessGuard', () => {
          it('is off without an explicit range (freshness handled by the timespan filter)', () => {
            expect(
              new OverviewStatusService(buildRouteContext({})).shouldApplyFreshnessGuard()
            ).toBe(false);
          });

          it('is on for a window that ends at ~now', () => {
            const service = new OverviewStatusService(
              buildRouteContext({ dateRangeStart: 'now-24h', dateRangeEnd: 'now' })
            );
            expect(service.shouldApplyFreshnessGuard()).toBe(true);
          });

          it('is off for a historical window that ends in the past', () => {
            const service = new OverviewStatusService(
              buildRouteContext({
                dateRangeStart: '2022-01-01T00:00:00.000Z',
                dateRangeEnd: '2022-01-02T00:00:00.000Z',
              })
            );
            expect(service.shouldApplyFreshnessGuard()).toBe(false);
          });
        });

        describe('isStaleRun', () => {
          const service = new OverviewStatusService(buildRouteContext({}));

          it('treats a run older than ~2 schedule intervals (15m floor) as stale', () => {
            // 1m schedule → 15m floor applies.
            expect(service.isStaleRun(moment().subtract(10, 'minutes').toISOString(), 1)).toBe(
              false
            );
            expect(service.isStaleRun(moment().subtract(20, 'minutes').toISOString(), 1)).toBe(
              true
            );
            // 30m schedule → threshold scales to ~60m.
            expect(service.isStaleRun(moment().subtract(45, 'minutes').toISOString(), 30)).toBe(
              false
            );
            expect(service.isStaleRun(moment().subtract(2, 'hours').toISOString(), 30)).toBe(true);
          });

          it('is never stale when there is no timestamp', () => {
            expect(service.isStaleRun(undefined, 1)).toBe(false);
          });
        });

        it('demotes a monitor whose latest run is stale to stale in a live window', async () => {
          const { esClient, syntheticsEsClient } = getUptimeESMockClient();
          // id1 last reported 3h ago — well past its 1m schedule — so in a live
          // "now" window its green status can no longer be trusted as current.
          // id2 never reported at all, so it stays `pending` (first-run): the two
          // are deliberately distinct buckets.
          const staleTs = moment().subtract(3, 'hours').toISOString();
          esClient.search.mockResponseOnce(getEsResponse({ buckets: id1BucketAt(staleTs, 'up') }));

          const overviewStatusService = new OverviewStatusService(
            buildRouteContext(
              { dateRangeStart: 'now-24h', dateRangeEnd: 'now' },
              syntheticsEsClient
            )
          );
          overviewStatusService.getMonitorConfigs = jest
            .fn()
            .mockResolvedValue(testMonitors as any);

          const result = await overviewStatusService.getOverviewStatus();

          // id1 stopped reporting → stale (distinct from its stale "up").
          expect(result.upConfigs.id1).toBeUndefined();
          expect(result.pendingConfigs.id1).toBeUndefined();
          expect(result.staleConfigs.id1).toBeDefined();
          expect(result.staleConfigs.id1.overallStatus).toBe('stale');
          expect(result.staleConfigs.id1.locations[0].status).toBe('stale');
          // The stale last-known status is carried so the "show last run" toggle
          // can restore it client-side without a refetch.
          expect(result.staleConfigs.id1.locations[0].lastStatus).toBe('up');
          expect(result.stale).toBe(1);

          // id2 never reported in the window at all → genuine first-run pending.
          expect(result.staleConfigs.id2).toBeUndefined();
          expect(result.pendingConfigs.id2).toBeDefined();
          expect(result.pendingConfigs.id2.locations[0].status).toBe('pending');
        });

        it("keeps a stale run's last-known status when inspecting a historical window", async () => {
          const { esClient, syntheticsEsClient } = getUptimeESMockClient();
          // Same old data, but the window ends in the past — the user explicitly
          // asked for that point in time, so the in-window status stands.
          esClient.search.mockResponseOnce(
            getEsResponse({ buckets: id1BucketAt('2022-01-01T12:00:00.000Z', 'up') })
          );

          const overviewStatusService = new OverviewStatusService(
            buildRouteContext(
              {
                dateRangeStart: '2022-01-01T00:00:00.000Z',
                dateRangeEnd: '2022-01-02T00:00:00.000Z',
              },
              syntheticsEsClient
            )
          );
          overviewStatusService.getMonitorConfigs = jest
            .fn()
            .mockResolvedValue(testMonitors as any);

          const result = await overviewStatusService.getOverviewStatus();

          expect(result.upConfigs.id1).toBeDefined();
          expect(result.upConfigs.id1.locations[0].status).toBe('up');
        });
      });

      it('drops the "currently fresh" timespan filter and uses the picker range when a range is provided', async () => {
        const { esClient, syntheticsEsClient } = getUptimeESMockClient();
        esClient.search.mockResponseOnce(getEsResponse({ buckets: [] }));

        const overviewStatusService = new OverviewStatusService(
          buildRouteContext(
            {
              dateRangeStart: '2022-01-01T00:00:00.000Z',
              dateRangeEnd: '2022-01-02T00:00:00.000Z',
            },
            syntheticsEsClient
          )
        );
        overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue(testMonitors as any);

        await overviewStatusService.getOverviewStatus();

        const filters = (esClient.search.mock.calls[0][0] as any).query.bool.filter;
        expect(filters.find((f: any) => f.range?.['monitor.timespan'])).toBeUndefined();
        expect(filters.find((f: any) => f.range?.['@timestamp']).range['@timestamp']).toEqual({
          gte: '2022-01-01T00:00:00.000Z',
          lte: '2022-01-02T00:00:00.000Z',
        });
      });

      it('keeps the timespan filter and default look-back window when no range is provided', async () => {
        const { esClient, syntheticsEsClient } = getUptimeESMockClient();
        esClient.search.mockResponseOnce(getEsResponse({ buckets: [] }));

        const overviewStatusService = new OverviewStatusService(
          buildRouteContext({}, syntheticsEsClient)
        );
        overviewStatusService.getMonitorConfigs = jest.fn().mockResolvedValue(testMonitors as any);

        await overviewStatusService.getOverviewStatus();

        const filters = (esClient.search.mock.calls[0][0] as any).query.bool.filter;
        expect(
          filters.find((f: any) => f.range?.['monitor.timespan']).range['monitor.timespan']
        ).toEqual({ gte: 'now-15m', lte: 'now' });
        expect(filters.find((f: any) => f.range?.['@timestamp']).range['@timestamp'].lte).toBe(
          'now'
        );
      });
    });
  });

  describe('getStaleStatusBeforeWindow', () => {
    const usLoc = { id: 'us_east', label: 'US East' };

    const buildRouteContext = (query: Record<string, any>, syntheticsEsClient?: any): any => ({
      request: { query },
      syntheticsEsClient,
      server: {
        isElasticsearchServerless: false,
        config: { experimental: { ccs: { enabled: false } } },
      },
    });

    const liveWindowQuery = (extra: Record<string, any> = {}) => ({
      dateRangeStart: 'now-24h',
      dateRangeEnd: 'now',
      monitorQueryIds: ['mon1'],
      ...extra,
    });

    it('returns the latest run before the window for each probed monitor/location', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      const priorTs = moment().subtract(3, 'hours').toISOString();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'mon1', locationId: usLoc.id },
              status: { top: [{ metrics: { 'monitor.status': 'up' }, sort: [priorTs] }] },
            },
          ],
        })
      );

      const service = new OverviewStatusService(
        buildRouteContext(liveWindowQuery(), syntheticsEsClient)
      );

      const result = await service.getStaleStatusBeforeWindow();

      // The endpoint returns only the raw prior-run facts — no saved-object
      // reload, no staleness classification (the client applies the threshold).
      expect(result.priorRuns).toEqual([
        { monitorQueryId: 'mon1', locationId: usLoc.id, timestamp: priorTs, status: 'up' },
      ]);
    });

    it('returns the prior run regardless of freshness (the client applies the threshold)', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      const freshTs = moment().subtract(2, 'minutes').toISOString();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'mon1', locationId: usLoc.id },
              status: { top: [{ metrics: { 'monitor.status': 'up' }, sort: [freshTs] }] },
            },
          ],
        })
      );

      const service = new OverviewStatusService(
        buildRouteContext(liveWindowQuery(), syntheticsEsClient)
      );

      const result = await service.getStaleStatusBeforeWindow();

      expect(result.priorRuns).toEqual([
        { monitorQueryId: 'mon1', locationId: usLoc.id, timestamp: freshTs, status: 'up' },
      ]);
    });

    it('returns a prior run per location for a multi-location monitor', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      const priorTs = moment().subtract(3, 'hours').toISOString();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'mon1', locationId: usLoc.id },
              status: { top: [{ metrics: { 'monitor.status': 'down' }, sort: [priorTs] }] },
            },
            // euLoc has no prior run at all → not returned
          ],
        })
      );

      const service = new OverviewStatusService(
        buildRouteContext(liveWindowQuery(), syntheticsEsClient)
      );

      const result = await service.getStaleStatusBeforeWindow();

      expect(result.priorRuns).toEqual([
        { monitorQueryId: 'mon1', locationId: usLoc.id, timestamp: priorTs, status: 'down' },
      ]);
    });

    it('scopes the lookup to the requested monitors and queries strictly before the window', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(getEsResponse({ buckets: [] }));

      const service = new OverviewStatusService(
        buildRouteContext(
          liveWindowQuery({ monitorQueryIds: ['mon1', 'mon2'] }),
          syntheticsEsClient
        )
      );

      await service.getStaleStatusBeforeWindow();

      const filters = (esClient.search.mock.calls[0][0] as any).query.bool.filter;
      const idsFilter = filters.find((f: any) => f.terms?.['monitor.id']);
      expect(idsFilter.terms['monitor.id']).toEqual(['mon1', 'mon2']);
      // looks strictly *before* the window start, capped to a 30-day lookback
      const tsFilter = filters.find((f: any) => f.range?.['@timestamp']);
      expect(tsFilter.range['@timestamp'].lt).toBeDefined();
      expect(tsFilter.range['@timestamp'].gte).toBe('now-30d');
      // the "currently fresh" timespan guard must not be applied to old data
      expect(filters.find((f: any) => f.range?.['monitor.timespan'])).toBeUndefined();
    });

    it('does not query ES for a historical window', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      const service = new OverviewStatusService(
        buildRouteContext(
          {
            dateRangeStart: '2022-01-01T00:00:00.000Z',
            dateRangeEnd: '2022-01-02T00:00:00.000Z',
            monitorQueryIds: ['mon1'],
          },
          syntheticsEsClient
        )
      );

      const result = await service.getStaleStatusBeforeWindow();

      expect(result).toEqual({ priorRuns: [] });
      expect(esClient.search).not.toHaveBeenCalled();
    });

    it('returns empty when no pending monitor ids are provided', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      const service = new OverviewStatusService(
        buildRouteContext({ dateRangeStart: 'now-24h', dateRangeEnd: 'now' }, syntheticsEsClient)
      );

      const result = await service.getStaleStatusBeforeWindow();

      expect(result).toEqual({ priorRuns: [] });
      expect(esClient.search).not.toHaveBeenCalled();
    });
  });

  describe('Heartbeat / Elastic Agent managed monitors', () => {
    // A genuine autodiscovery ping carries neither `config_id` nor
    // `meta.space_id` — its identity is `monitor.id`. Tests that want to model a
    // Kibana-pushed (deleted) monitor add those markers explicitly.
    const heartbeatBucket = (overrides: { monitorId: string; status: string; metrics?: any }) => ({
      key: { monitorId: overrides.monitorId, locationId: japanLoc.id },
      status: {
        key: japanLoc.id,
        top: [
          {
            metrics: {
              'monitor.status': overrides.status,
              'monitor.name': 'k8s autodiscovered monitor',
              'monitor.type': 'http',
              'monitor.interval': 600,
              tags: ['kube-system'],
              ...overrides.metrics,
            },
            sort: ['2025-05-28T10:00:00.000Z'],
          },
        ],
      },
      location_name: { buckets: [{ key: 'My K8s Cluster', doc_count: 1 }] },
    });

    it('surfaces a local monitor with no saved object as origin: heartbeat', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [heartbeatBucket({ monitorId: 'hb-1', status: 'up' })],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
          config: { experimental: { ccs: { enabled: false } } },
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest.fn().mockResolvedValue([] as any);

      const result = await service.getOverviewStatus();

      const entry = result.upConfigs['heartbeat-hb-1-asia_japan'];
      expect(entry).toBeDefined();
      expect(entry.origin).toBe('heartbeat');
      expect(entry.remote).toBeUndefined();
      expect(entry.isEnabled).toBe(true);
      expect(entry.isStatusAlertEnabled).toBe(false);
      expect(entry.name).toBe('k8s autodiscovered monitor');
      expect(entry.type).toBe('http');
      // monitor.interval is treated as seconds and rendered in minutes,
      // mirroring the remote-only monitor path.
      expect(entry.schedule).toBe('10');
      expect(entry.tags).toEqual(['kube-system']);
      expect(entry.locations).toEqual([{ id: japanLoc.id, label: 'My K8s Cluster', status: 'up' }]);
      expect(result.up).toBe(1);
    });

    const runWithBuckets = async (buckets: any[]) => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(getEsResponse({ buckets }));

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
          config: { experimental: { ccs: { enabled: false } } },
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest.fn().mockResolvedValue([] as any);
      return service.getOverviewStatus();
    };

    // Kibana stamps both `config_id` and `meta.space_id` onto every monitor it
    // pushes. A monitor deleted from Kibana leaves behind pings that still carry
    // them until they age out; a standalone Heartbeat user could also set either
    // field. In all those cases the ping must NOT be surfaced as an
    // autodiscovery (`heartbeat`) monitor — only a ping with neither marker is.
    it('does not surface a no-saved-object ping that carries meta.space_id as heartbeat', async () => {
      const result = await runWithBuckets([
        {
          ...heartbeatBucket({ monitorId: 'has-space', status: 'up' }),
          space_id: { buckets: [{ key: 'default', doc_count: 1 }] },
        },
      ]);

      expect(result.upConfigs['heartbeat-has-space-asia_japan']).toBeUndefined();
      expect(result.up).toBe(0);
    });

    it('does not surface a no-saved-object ping that carries config_id as heartbeat', async () => {
      const result = await runWithBuckets([
        heartbeatBucket({
          monitorId: 'has-config',
          status: 'up',
          metrics: { config_id: 'so-uuid-1234' },
        }),
      ]);

      expect(result.upConfigs['heartbeat-has-config-asia_japan']).toBeUndefined();
      expect(result.upConfigs['heartbeat-so-uuid-1234-asia_japan']).toBeUndefined();
      expect(result.up).toBe(0);
    });

    it('surfaces a ping with neither config_id nor meta.space_id as heartbeat', async () => {
      const result = await runWithBuckets([heartbeatBucket({ monitorId: 'bare', status: 'up' })]);

      const entry = result.upConfigs['heartbeat-bare-asia_japan'];
      expect(entry).toBeDefined();
      expect(entry.origin).toBe('heartbeat');
      expect(result.up).toBe(1);
    });

    it('falls back to monitor.id and location id when ping metadata is missing', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'hb-bare', locationId: japanLoc.id },
              status: {
                key: japanLoc.id,
                top: [
                  { metrics: { 'monitor.status': 'down' }, sort: ['2025-05-28T10:00:00.000Z'] },
                ],
              },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
          config: { experimental: { ccs: { enabled: false } } },
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest.fn().mockResolvedValue([] as any);

      const result = await service.getOverviewStatus();

      const entry = result.downConfigs['heartbeat-hb-bare-asia_japan'];
      expect(entry).toBeDefined();
      expect(entry.origin).toBe('heartbeat');
      expect(entry.name).toBe('hb-bare');
      expect(entry.type).toBe('unknown');
      expect(entry.schedule).toBe('');
      expect(entry.tags).toEqual([]);
      expect(entry.locations[0].label).toBe(japanLoc.id);
    });

    it('surfaces a location-less autodiscovery monitor under the placeholder location', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      // Kubernetes/Docker autodiscovery pings carry no `observer.name`, so the
      // composite `locationId` source (with `missing_bucket: true`) returns a
      // null key and the `observer.geo.name` sub-agg is empty.
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'hb-no-loc', locationId: null },
              status: {
                top: [
                  {
                    metrics: {
                      'monitor.status': 'up',
                      'monitor.name': 'k8s autodiscovered monitor',
                      'monitor.type': 'http',
                    },
                    sort: ['2025-05-28T10:00:00.000Z'],
                  },
                ],
              },
              location_name: { buckets: [] },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
          config: { experimental: { ccs: { enabled: false } } },
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest.fn().mockResolvedValue([] as any);

      const result = await service.getOverviewStatus();

      const entry = result.upConfigs[`heartbeat-hb-no-loc-${HEARTBEAT_UNMAPPED_LOCATION_ID}`];
      expect(entry).toBeDefined();
      expect(entry.origin).toBe('heartbeat');
      expect(entry.locations).toEqual([
        {
          id: HEARTBEAT_UNMAPPED_LOCATION_ID,
          label: HEARTBEAT_UNMAPPED_LOCATION_LABEL,
          status: 'up',
        },
      ]);
      expect(result.up).toBe(1);
    });

    it('surfaces a space-less heartbeat monitor when a space is active', async () => {
      // Regression: earlier Heartbeat tests omit `spaceId`, which short-circuits
      // `getSpaceFilters` entirely. Autodiscovery pings carry no `meta.space_id`,
      // so with a space active the filter must still permit field-missing docs —
      // otherwise a plain `terms` clause silently drops them ("nothing shows").
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            {
              key: { monitorId: 'hb-no-space', locationId: null },
              status: {
                top: [
                  {
                    metrics: {
                      'monitor.status': 'up',
                      'monitor.name': 'k8s autodiscovered monitor',
                      'monitor.type': 'http',
                    },
                    sort: ['2025-05-28T10:00:00.000Z'],
                  },
                ],
              },
              location_name: { buckets: [] },
            },
          ],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        spaceId: 'default',
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
          config: { experimental: { ccs: { enabled: false } } },
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest.fn().mockResolvedValue([] as any);

      const result = await service.getOverviewStatus();

      const [[searchBody]] = esClient.search.mock.calls;
      const spaceFilter = (searchBody as any).query.bool.filter.find((f: any) =>
        f.bool?.should?.some((s: any) => s.terms?.['meta.space_id'])
      );
      expect(spaceFilter).toBeDefined();
      expect(spaceFilter.bool.should).toContainEqual({
        bool: { must_not: { exists: { field: 'meta.space_id' } } },
      });

      const entry = result.upConfigs[`heartbeat-hb-no-space-${HEARTBEAT_UNMAPPED_LOCATION_ID}`];
      expect(entry).toBeDefined();
      expect(entry.origin).toBe('heartbeat');
    });

    it('requests the observer.name composite source with missing_bucket enabled', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(getEsResponse({ buckets: [] }));

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
          config: { experimental: { ccs: { enabled: false } } },
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest.fn().mockResolvedValue([] as any);

      await service.getOverviewStatus();

      const [[searchBody]] = esClient.search.mock.calls;
      const sources = (searchBody as any).aggs.monitors.composite.sources;
      const locationSource = sources.find((source: any) => source.locationId);
      expect(locationSource.locationId.terms).toEqual({
        field: 'observer.name',
        missing_bucket: true,
      });
    });

    it('does not surface monitors that already have a saved object', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [heartbeatBucket({ monitorId: 'id1', status: 'up' })],
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
          config: { experimental: { ccs: { enabled: false } } },
        },
      };
      const service = new OverviewStatusService(routeContext);
      // id1 is a real saved-object monitor.
      service.getMonitorConfigs = jest.fn().mockResolvedValue(testMonitors as any);

      const result = await service.getOverviewStatus();

      expect(result.upConfigs['heartbeat-id1-asia_japan']).toBeUndefined();
      // id1 is surfaced via its saved object instead.
      expect(result.upConfigs.id1).toBeDefined();
      expect(result.upConfigs.id1.origin).toBeUndefined();
    });

    it('caps the number of distinct heartbeat monitors surfaced', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      const overLimit = HEARTBEAT_MONITORS_OVERVIEW_LIMIT + 50;
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: times(overLimit).map((i) =>
            heartbeatBucket({ monitorId: `hb-${i}`, status: 'up' })
          ),
        })
      );

      const routeContext: any = {
        request: { query: {} },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
          config: { experimental: { ccs: { enabled: false } } },
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest.fn().mockResolvedValue([] as any);

      const result = await service.getOverviewStatus();

      const heartbeatKeys = Object.keys(result.upConfigs).filter((k) => k.startsWith('heartbeat-'));
      expect(heartbeatKeys).toHaveLength(HEARTBEAT_MONITORS_OVERVIEW_LIMIT);
    });

    it('excludes heartbeat monitors when includeHeartbeatMonitors is false', async () => {
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();
      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            heartbeatBucket({ monitorId: 'hb-1', status: 'up' }),
            heartbeatBucket({ monitorId: 'hb-2', status: 'down' }),
          ],
        })
      );

      const routeContext: any = {
        request: { query: { includeHeartbeatMonitors: false } },
        syntheticsEsClient,
        server: {
          isElasticsearchServerless: false,
          config: { experimental: { ccs: { enabled: false } } },
        },
      };
      const service = new OverviewStatusService(routeContext);
      service.getMonitorConfigs = jest.fn().mockResolvedValue([] as any);

      const result = await service.getOverviewStatus();

      const heartbeatKeys = [
        ...Object.keys(result.upConfigs),
        ...Object.keys(result.downConfigs),
      ].filter((k) => k.startsWith('heartbeat-'));
      expect(heartbeatKeys).toHaveLength(0);
      // Counts follow the exclusion — the skipped monitors are not tallied.
      expect(result.up).toBe(0);
      expect(result.down).toBe(0);
    });
  });
  describe('paginateConfigs', () => {
    const makeMeta = (
      id: string,
      overrides: Partial<{
        overallStatus: string;
        name: string;
        urls: string;
        type: string;
        updated_at: string;
      }> = {}
    ): any => ({
      configId: id,
      monitorQueryId: id,
      name: overrides.name ?? `monitor-${id}`,
      schedule: '3',
      tags: [],
      isEnabled: overrides.overallStatus !== 'disabled',
      isStatusAlertEnabled: false,
      type: overrides.type ?? 'http',
      overallStatus: overrides.overallStatus ?? 'up',
      locations: [{ id: 'loc1', label: 'Loc 1', status: overrides.overallStatus ?? 'up' }],
      urls: overrides.urls,
      updated_at: overrides.updated_at,
    });

    const upConfigs: Record<string, any> = {
      m1: makeMeta('m1', {
        name: 'Alpha',
        urls: 'https://alpha.io',
        updated_at: '2025-01-01T00:00:00Z',
      }),
      m2: makeMeta('m2', {
        name: 'Beta',
        urls: 'https://beta.io',
        updated_at: '2025-03-01T00:00:00Z',
      }),
      m3: makeMeta('m3', { name: 'Gamma', updated_at: '2025-02-01T00:00:00Z' }),
    };
    const downConfigs: Record<string, any> = {
      m4: makeMeta('m4', {
        overallStatus: 'down',
        name: 'Delta',
        urls: 'https://delta.io',
        updated_at: '2025-04-01T00:00:00Z',
      }),
      m5: makeMeta('m5', {
        overallStatus: 'down',
        name: 'Epsilon',
        updated_at: '2025-05-01T00:00:00Z',
      }),
    };
    const pendingConfigs: Record<string, any> = {
      m6: makeMeta('m6', { overallStatus: 'pending', name: 'Zeta' }),
    };
    const disabledConfigs: Record<string, any> = {
      m7: makeMeta('m7', { overallStatus: 'disabled', name: 'Eta' }),
    };

    const allBuckets = { upConfigs, downConfigs, pendingConfigs, disabledConfigs };

    const createService = (query: Record<string, any> = {}) => {
      const routeContext: any = {
        request: { query },
        server: {
          isElasticsearchServerless: false,
          config: { experimental: { ccs: { enabled: false } } },
        },
      };
      return new OverviewStatusService(routeContext);
    };

    it('returns the first page with correct total', () => {
      const service = createService({ page: 1, perPage: 3 });
      const result = service.paginateConfigs(allBuckets);

      expect(result.total).toBe(7);
      expect(result.configs).toHaveLength(3);
    });

    it('returns the second page', () => {
      const service = createService({ page: 2, perPage: 3 });
      const result = service.paginateConfigs(allBuckets);

      expect(result.total).toBe(7);
      expect(result.configs).toHaveLength(3);
    });

    it('returns a partial last page', () => {
      const service = createService({ page: 3, perPage: 3 });
      const result = service.paginateConfigs(allBuckets);

      expect(result.total).toBe(7);
      expect(result.configs).toHaveLength(1);
    });

    it('returns empty configs when page is beyond range', () => {
      const service = createService({ page: 10, perPage: 3 });
      const result = service.paginateConfigs(allBuckets);

      expect(result.total).toBe(7);
      expect(result.configs).toHaveLength(0);
    });

    it('sorts by status asc: down first, then up, disabled, pending', () => {
      const service = createService({
        page: 1,
        perPage: 20,
        sortField: 'status',
        sortOrder: 'asc',
      });
      const result = service.paginateConfigs(allBuckets);

      const statuses = result.configs.map((c: any) => c.overallStatus);
      expect(statuses).toEqual(['down', 'down', 'up', 'up', 'up', 'disabled', 'pending']);
    });

    it('sorts by status desc: a true full reverse of the asc rank order', () => {
      const service = createService({
        page: 1,
        perPage: 20,
        sortField: 'status',
        sortOrder: 'desc',
      });
      const result = service.paginateConfigs(allBuckets);

      const statuses = result.configs.map((c: any) => c.overallStatus);
      expect(statuses).toEqual(['pending', 'disabled', 'up', 'up', 'up', 'down', 'down']);
    });

    it('sorts by status using a fixed rank, not just an up/down swap (covers stale too)', () => {
      const withStale = {
        upConfigs: { u1: makeMeta('u1', { name: 'U' }) },
        downConfigs: { d1: makeMeta('d1', { overallStatus: 'down', name: 'D' }) },
        pendingConfigs: { p1: makeMeta('p1', { overallStatus: 'pending', name: 'P' }) },
        disabledConfigs: { x1: makeMeta('x1', { overallStatus: 'disabled', name: 'X' }) },
        staleConfigs: { s1: makeMeta('s1', { overallStatus: 'stale', name: 'S' }) },
      };

      const asc = createService({
        page: 1,
        perPage: 20,
        sortField: 'status',
        sortOrder: 'asc',
      }).paginateConfigs(withStale);
      expect(asc.configs.map((c: any) => c.overallStatus)).toEqual([
        'down',
        'up',
        'disabled',
        'pending',
        'stale',
      ]);

      const desc = createService({
        page: 1,
        perPage: 20,
        sortField: 'status',
        sortOrder: 'desc',
      }).paginateConfigs(withStale);
      expect(desc.configs.map((c: any) => c.overallStatus)).toEqual([
        'stale',
        'pending',
        'disabled',
        'up',
        'down',
      ]);
    });

    it('sorts by name ascending', () => {
      const service = createService({
        page: 1,
        perPage: 20,
        sortField: 'name.keyword',
        sortOrder: 'asc',
      });
      const result = service.paginateConfigs(allBuckets);

      const names = result.configs.map((c: any) => c.name);
      expect(names).toEqual(['Alpha', 'Beta', 'Delta', 'Epsilon', 'Eta', 'Gamma', 'Zeta']);
    });

    it('sorts by name descending', () => {
      const service = createService({
        page: 1,
        perPage: 20,
        sortField: 'name.keyword',
        sortOrder: 'desc',
      });
      const result = service.paginateConfigs(allBuckets);

      const names = result.configs.map((c: any) => c.name);
      expect(names).toEqual(['Zeta', 'Gamma', 'Eta', 'Epsilon', 'Delta', 'Beta', 'Alpha']);
    });

    it('sorts by updated_at ascending', () => {
      const service = createService({
        page: 1,
        perPage: 20,
        sortField: 'updated_at',
        sortOrder: 'asc',
      });
      const result = service.paginateConfigs(allBuckets);

      const names = result.configs.map((c: any) => c.name);
      // Dated monitors sort in date order regardless of where the undated ones land
      expect(names.indexOf('Alpha')).toBeLessThan(names.indexOf('Beta'));
      expect(names.indexOf('Beta')).toBeLessThan(names.indexOf('Delta'));
    });

    it('treats a missing updated_at as "now", not epoch 0', () => {
      // Zeta (pending) and Eta (disabled) have no updated_at.
      const asc = createService({
        page: 1,
        perPage: 20,
        sortField: 'updated_at',
        sortOrder: 'asc',
      }).paginateConfigs(allBuckets);
      const ascNames = asc.configs.map((c: any) => c.name);
      // Undated monitors are treated as most-recent, so they sort after every
      // dated monitor in ascending (oldest-first) order.
      expect(ascNames.indexOf('Zeta')).toBeGreaterThan(ascNames.indexOf('Epsilon'));
      expect(ascNames.indexOf('Eta')).toBeGreaterThan(ascNames.indexOf('Epsilon'));

      const desc = createService({
        page: 1,
        perPage: 20,
        sortField: 'updated_at',
        sortOrder: 'desc',
      }).paginateConfigs(allBuckets);
      const descNames = desc.configs.map((c: any) => c.name);
      // ...and first in descending (most-recent-first) order.
      expect(descNames.indexOf('Zeta')).toBeLessThan(descNames.indexOf('Epsilon'));
      expect(descNames.indexOf('Eta')).toBeLessThan(descNames.indexOf('Epsilon'));
    });

    it('sorts by urls with empty urls last', () => {
      const service = createService({ page: 1, perPage: 20, sortField: 'urls', sortOrder: 'asc' });
      const result = service.paginateConfigs(allBuckets);

      const urls = result.configs.map((c: any) => c.urls ?? '(none)');
      const withUrls = urls.filter((u: string) => u !== '(none)');
      const withoutUrls = urls.filter((u: string) => u === '(none)');
      // URLs are sorted alphabetically, then entries without URLs come last
      expect(withUrls).toEqual(['https://alpha.io', 'https://beta.io', 'https://delta.io']);
      expect(withoutUrls).toHaveLength(4);
      // All url-less entries are at the end
      expect(urls.indexOf(withoutUrls[0])).toBeGreaterThan(
        urls.lastIndexOf(withUrls[withUrls.length - 1])
      );
    });

    it('sorts by type ascending', () => {
      const mixedTypes = {
        upConfigs: {
          t1: makeMeta('t1', { type: 'http', name: 'HTTP Mon' }),
          t2: makeMeta('t2', { type: 'browser', name: 'Browser Mon' }),
        },
        downConfigs: {
          t3: makeMeta('t3', { overallStatus: 'down', type: 'tcp', name: 'TCP Mon' }),
        },
        pendingConfigs: {},
        disabledConfigs: {},
      };
      const service = createService({
        page: 1,
        perPage: 20,
        sortField: 'type.keyword',
        sortOrder: 'asc',
      });
      const result = service.paginateConfigs(mixedTypes);

      const types = result.configs.map((c: any) => c.type);
      expect(types).toEqual(['browser', 'http', 'tcp']);
    });

    it('filters by statusFilter=down', () => {
      const service = createService({ page: 1, perPage: 20, statusFilter: 'down' });
      const result = service.paginateConfigs(allBuckets);

      expect(result.total).toBe(2);
      expect(result.configs.every((c: any) => c.overallStatus === 'down')).toBe(true);
    });

    it('filters by statusFilter=up', () => {
      const service = createService({ page: 1, perPage: 20, statusFilter: 'up' });
      const result = service.paginateConfigs(allBuckets);

      expect(result.total).toBe(3);
      expect(result.configs.every((c: any) => c.overallStatus === 'up')).toBe(true);
    });

    it('filters by statusFilter=disabled', () => {
      const service = createService({ page: 1, perPage: 20, statusFilter: 'disabled' });
      const result = service.paginateConfigs(allBuckets);

      expect(result.total).toBe(1);
      expect(result.configs[0].configId).toBe('m7');
    });

    it('filters by statusFilter=pending', () => {
      const service = createService({ page: 1, perPage: 20, statusFilter: 'pending' });
      const result = service.paginateConfigs(allBuckets);

      expect(result.total).toBe(1);
      expect(result.configs[0].configId).toBe('m6');
    });

    it('populates page config maps matching the page items', () => {
      const service = createService({ page: 1, perPage: 3, sortField: 'status', sortOrder: 'asc' });
      const result = service.paginateConfigs(allBuckets);

      // Page 1 with status asc: first 3 items are m4 (down), m5 (down), then one up
      expect(Object.keys(result.pageDownConfigs)).toHaveLength(2);
      expect(result.pageDownConfigs.m4).toBeDefined();
      expect(result.pageDownConfigs.m5).toBeDefined();
      expect(Object.keys(result.pageUpConfigs)).toHaveLength(1);
      expect(Object.keys(result.pagePendingConfigs)).toHaveLength(0);
      expect(Object.keys(result.pageDisabledConfigs)).toHaveLength(0);
    });

    it('combines statusFilter with pagination', () => {
      const service = createService({ page: 1, perPage: 2, statusFilter: 'up' });
      const result = service.paginateConfigs(allBuckets);

      expect(result.total).toBe(3);
      expect(result.configs).toHaveLength(2);
      expect(result.configs.every((c: any) => c.overallStatus === 'up')).toBe(true);
    });

    it('combines statusFilter with sort by name', () => {
      const service = createService({
        page: 1,
        perPage: 20,
        statusFilter: 'up',
        sortField: 'name.keyword',
        sortOrder: 'asc',
      });
      const result = service.paginateConfigs(allBuckets);

      const names = result.configs.map((c: any) => c.name);
      expect(names).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('keeps two CCS rows that share configId in page buckets', () => {
      const east = {
        ...makeMeta('shared', { name: 'East' }),
        remote: { remoteName: 'cluster-east' },
        locations: [{ id: 'us-east-1', label: 'us-east-1', status: 'up' }],
      };
      const west = {
        ...makeMeta('shared', { name: 'West' }),
        remote: { remoteName: 'cluster-west' },
        locations: [{ id: 'us-east-1', label: 'us-east-1', status: 'up' }],
      };
      const service = createService({ page: 1, perPage: 20 });
      const result = service.paginateConfigs({
        upConfigs: {
          'cluster-east-shared-us-east-1': east,
          'cluster-west-shared-us-east-1': west,
        },
        downConfigs: {},
        pendingConfigs: {},
        disabledConfigs: {},
      });

      expect(result.configs).toHaveLength(2);
      expect(Object.keys(result.pageUpConfigs).sort()).toEqual([
        'cluster-east-shared-us-east-1',
        'cluster-west-shared-us-east-1',
      ]);
    });

    it('handles empty config maps', () => {
      const service = createService({ page: 1, perPage: 20 });
      const result = service.paginateConfigs({
        upConfigs: {},
        downConfigs: {},
        pendingConfigs: {},
        disabledConfigs: {},
      });

      expect(result.total).toBe(0);
      expect(result.configs).toHaveLength(0);
    });
  });
});

function getEsResponse({ buckets, after }: { buckets: any[]; after?: any }) {
  return {
    took: 605,
    timed_out: false,
    _shards: {
      total: 3,
      successful: 3,
      skipped: 0,
      failed: 0,
    },
    hits: {
      hits: [],
    },
    aggregations: {
      monitors: {
        buckets,
        after_key: after,
      },
    },
  };
}
