/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { SavedObjectsFindResult } from '@kbn/core-saved-objects-api-server';
import type { EncryptedSyntheticsMonitorAttributes } from '../../../common/runtime_types';
import { getUptimeESMockClient } from '../../queries/test_helpers';

import * as allLocationsFn from '../../synthetics_service/get_all_locations';
import { OverviewStatusService, SUMMARIES_PAGE_SIZE } from './overview_status_service';
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
                    },
                    sort: ['2022-09-15T16:19:16.724Z'],
                  },
                ],
              },
              index_name: {
                buckets: [{ key: 'cluster-west:synthetics-browser-default', doc_count: 1 }],
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
              index_name: {
                buckets: [{ key: 'synthetics-browser-default', doc_count: 1 }],
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
              index_name: {
                buckets: [{ key: 'synthetics-browser-default', doc_count: 1 }],
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
              index_name: {
                buckets: [{ key: 'synthetics-browser-default', doc_count: 1 }],
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
                    },
                    sort: ['2022-09-15T16:20:00.000Z'],
                  },
                ],
              },
              index_name: {
                buckets: [{ key: 'cluster-east:synthetics-browser-default', doc_count: 1 }],
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
                    },
                    sort: ['2022-09-15T16:20:00.000Z'],
                  },
                ],
              },
              index_name: {
                buckets: [{ key: 'cluster-east:synthetics-http-default', doc_count: 1 }],
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
                    },
                    sort: ['2022-09-15T16:21:00.000Z'],
                  },
                ],
              },
              index_name: {
                buckets: [{ key: 'cluster-west:synthetics-http-default', doc_count: 1 }],
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

    it('does not surface a cross-space local monitor through the remote-only branch', async () => {
      // Defence-in-depth: the ES query already filters on `meta.space_id` for
      // both local and remote pings, so
      // a doc from another local space would normally be dropped at filter
      // time. Even if a stray cross-space doc reaches the reconciliation
      // step (e.g. in this test where we mock the ES response directly), the
      // JS-side guard in the remote-only branch must still drop it because
      // its `_index` has no cluster alias prefix.
      const { esClient, syntheticsEsClient } = getUptimeESMockClient();

      esClient.search.mockResponseOnce(
        getEsResponse({
          buckets: [
            // Cross-space LOCAL monitor: not in `testMonitors`, local _index.
            {
              key: {
                monitorId: 'cross-space-local',
                locationId: japanLoc.id,
              },
              status: {
                key: japanLoc.id,
                top: [
                  {
                    metrics: {
                      'monitor.status': 'down',
                      'monitor.name': 'Other-Space Monitor',
                      'monitor.type': 'http',
                      config_id: 'cross-space-local',
                    },
                    sort: ['2022-09-15T16:20:00.000Z'],
                  },
                ],
              },
              index_name: {
                buckets: [{ key: 'synthetics-http-default', doc_count: 1 }],
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

      expect(result.downConfigs['cross-space-local']).toBeUndefined();
      expect(result.upConfigs['cross-space-local']).toBeUndefined();
      expect(result.pendingConfigs['cross-space-local']).toBeUndefined();
      expect(result.down).toBe(0);
      expect(result.up).toBe(0);
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
              index_name: {
                buckets: [{ key: 'synthetics-browser-default', doc_count: 1 }],
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

      const spaceFilter = filters.find((f: any) => f.terms && f.terms['meta.space_id']);
      expect(spaceFilter).toBeDefined();
      expect(spaceFilter.terms['meta.space_id']).toEqual(['default', '*']);

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
      const spaceFilter = filters.find((f: any) => f.terms && f.terms['meta.space_id']);
      expect(spaceFilter).toBeDefined();
      expect(spaceFilter.terms['meta.space_id']).toEqual(['default', '*']);
      expect(spaceFilter.terms['meta.space_id']).not.toContain('production');

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
          { terms: { 'meta.space_id': ['default', '*'] } },
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
                    },
                    sort: ['2022-09-15T16:20:00.000Z'],
                  },
                ],
              },
              index_name: {
                buckets: [{ key: 'cluster-east:synthetics-http-production', doc_count: 1 }],
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

      // Active-space filter is still applied (single-space view) and the request
      // omits CCS-only sub-aggs (`index_name`, `location_name`).
      const searchCall = esClient.search.mock.calls[0][0] as any;
      const filters = searchCall.query.bool.filter;
      const spaceFilter = filters.find((f: any) => f.terms && f.terms['meta.space_id']);
      expect(spaceFilter).toBeDefined();
      expect(spaceFilter.terms['meta.space_id']).toContain('default');

      const monitorAggs = searchCall.aggs.monitors.aggs;
      expect(monitorAggs.index_name).toBeUndefined();
      expect(monitorAggs.location_name).toBeUndefined();

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
