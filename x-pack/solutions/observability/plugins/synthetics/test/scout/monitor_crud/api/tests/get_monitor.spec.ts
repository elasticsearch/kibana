/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { omit } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { ConfigKey } from '../../../../../common/runtime_types';
import { secretKeys } from '../../../../../common/constants/monitor_management';
import {
  apiTest,
  mergeSyntheticsApiHeaders,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../../../common/fixtures';
import type { ScoutPrivateLocation } from '../../../common/services/synthetics_private_location_api_service';
import {
  enableSynthetics,
  getMonitor,
  listMonitors,
  omitMonitorKeys,
  saveMonitorInternal,
} from '../../../common/fixtures/monitors';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';
import { icmpMonitorFixture } from '../fixtures/data/icmp_monitor';
import { tcpMonitorFixture } from '../fixtures/data/tcp_monitor';
import { browserMonitorFixture } from '../../../common/fixtures/data/browser_monitor';

interface ListedMonitor {
  id: string;
  name?: string;
  spaceId?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/get_monitor.ts`.
 *
 * The FTR file used two nested `describe`s (`get many monitors` / `get one
 * monitor`); Scout caps describe depth at one level, so those groupings are
 * flattened into the test titles.
 *
 * The FTR `gets monitors from all spaces` test asserted hardcoded cumulative
 * counts (22 default / 8 other-space) that depended on the exact number of
 * monitors created by every preceding test in the file. It is rewritten here to
 * be order-independent: it tags its own monitors with a unique run id and counts
 * only those.
 */
apiTest.describe(
  'getSyntheticsMonitors',
  {
    tag: [...tags.stateful.classic, ...tags.serverless.observability.complete],
  },
  () => {
    let editorHeaders: Record<string, string>;
    let privateLocation: ScoutPrivateLocation;
    let monitors: Array<Record<string, unknown>>;
    const spacesToCleanUp: string[] = [];

    const saveMonitor = async (
      apiClient: ApiClientFixture,
      monitor: Record<string, unknown>,
      spaceId?: string
    ) => {
      const res = await saveMonitorInternal(apiClient, editorHeaders, monitor, { spaceId });
      return res.body as Record<string, unknown> & { id: string };
    };

    apiTest.beforeAll(async ({ requestAuth, apiClient, apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
      await enableSynthetics(apiClient, editorHeaders);
      privateLocation = await apiServices.syntheticsPrivateLocations.getSharedPrivateLocation();

      monitors = [
        icmpMonitorFixture,
        tcpMonitorFixture,
        httpMonitorFixture,
        browserMonitorFixture,
      ].map((mon) => ({ ...mon, locations: [privateLocation] }));
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      for (const spaceId of spacesToCleanUp) {
        await kbnClient.spaces.delete(spaceId).catch(() => {});
      }
      spacesToCleanUp.length = 0;
    });

    apiTest('get many monitors - without params', async ({ apiClient }) => {
      const uuid = uuidv4();
      const saved: Array<Record<string, unknown> & { id: string }> = [];
      for (let i = 0; i < monitors.length; i++) {
        saved.push(
          await saveMonitor(apiClient, {
            ...monitors[i],
            name: `${String(monitors[i].name)}-${uuid}-${i}`,
          })
        );
      }
      const [mon1, mon2] = saved;

      const apiResponse = await listMonitors(
        apiClient,
        editorHeaders,
        'perPage=1000&internal=true'
      );

      const found = (apiResponse.body.monitors as ListedMonitor[]).filter(({ id }) =>
        [mon1.id, mon2.id].includes(id)
      );
      found.sort(({ id: a }) => (a === mon2.id ? 1 : a === mon1.id ? -1 : 0));

      found.forEach(({ updated_at: updatedAt, created_at: createdAt }) => {
        expect(Number.isNaN(new Date(createdAt as string).getTime())).toBe(false);
        expect(Number.isNaN(new Date(updatedAt as string).getTime())).toBe(false);
      });

      expect(
        found.map((fields) => omit(fields, 'updated_at', 'created_at', 'spaceId'))
      ).toStrictEqual(
        [mon1, mon2].map((expectedMon) =>
          omit(expectedMon, ['updated_at', 'created_at', ...secretKeys])
        )
      );
    });

    apiTest('get many monitors - with page params', async ({ apiClient }) => {
      const allMonitors = [...monitors, ...monitors];
      for (const mon of allMonitors) {
        await saveMonitor(apiClient, { ...mon, name: `${String(mon.name)}${Date.now()}` });
      }

      const firstPageResp = await listMonitors(apiClient, editorHeaders, 'page=1&perPage=2');
      const secondPageResp = await listMonitors(apiClient, editorHeaders, 'page=2&perPage=3');

      expect(firstPageResp.body.total).toBeGreaterThan(6);
      expect(firstPageResp.body.monitors).toHaveLength(2);
      expect(secondPageResp.body.monitors).toHaveLength(3);
      expect(firstPageResp.body.monitors[0].id).not.toBe(secondPageResp.body.monitors[0].id);
    });

    apiTest('get many monitors - with single monitorQueryId filter', async ({ apiClient }) => {
      const uuid = uuidv4();
      const saved: Array<Record<string, unknown> & { id: string }> = [];
      for (let i = 0; i < monitors.length; i++) {
        saved.push(await saveMonitor(apiClient, { ...monitors[i], name: `mon.name-${uuid}-${i}` }));
      }
      const id2 = saved[1].id;

      const resp = await listMonitors(
        apiClient,
        editorHeaders,
        `page=1&perPage=10&monitorQueryIds=${id2}`
      );

      const resultMonitorIds = (resp.body.monitors as ListedMonitor[]).map(({ id }) => id);
      expect(resultMonitorIds).toHaveLength(1);
      expect(resultMonitorIds).toStrictEqual([id2]);
    });

    apiTest('get many monitors - with multiple monitorQueryId filter', async ({ apiClient }) => {
      const uuid = uuidv4();
      const saved: Array<Record<string, unknown> & { id: string }> = [];
      for (let i = 0; i < monitors.length; i++) {
        saved.push(
          await saveMonitor(apiClient, {
            ...monitors[i],
            name: `${String(monitors[i].name)}-${uuid}-${i}`,
          })
        );
      }
      const id2 = saved[1].id;
      const id3 = saved[2].id;

      const resp = await listMonitors(
        apiClient,
        editorHeaders,
        `page=1&perPage=10&sortField=name.keyword&sortOrder=asc&monitorQueryIds=${id2}&monitorQueryIds=${id3}`
      );

      const resultMonitorIds = (resp.body.monitors as ListedMonitor[]).map(({ id }) => id);
      expect(resultMonitorIds).toHaveLength(2);
      expect(resultMonitorIds).toStrictEqual([id2, id3]);
    });

    apiTest(
      'get many monitors - monitorQueryId respects custom_heartbeat_id while filtering',
      async ({ apiClient }) => {
        const customHeartbeatId0 = 'custom-heartbeat-id-test-01';
        const customHeartbeatId1 = 'custom-heartbeat-id-test-02';
        await saveMonitor(apiClient, {
          ...monitors[0],
          [ConfigKey.CUSTOM_HEARTBEAT_ID]: customHeartbeatId0,
          [ConfigKey.NAME]: `NAME-${customHeartbeatId0}`,
        });
        await saveMonitor(apiClient, {
          ...monitors[1],
          [ConfigKey.CUSTOM_HEARTBEAT_ID]: customHeartbeatId1,
          [ConfigKey.NAME]: `NAME-${customHeartbeatId1}`,
        });

        const resp = await listMonitors(
          apiClient,
          editorHeaders,
          `page=1&perPage=10&sortField=name.keyword&sortOrder=asc&monitorQueryIds=${customHeartbeatId0}&monitorQueryIds=${customHeartbeatId1}`
        );

        const resultMonitorIds = (resp.body.monitors as ListedMonitor[])
          .map(({ id }) => id)
          .filter((id, index, arr) => arr.indexOf(id) === index);
        expect(resultMonitorIds).toHaveLength(2);
        expect(resultMonitorIds).toStrictEqual([customHeartbeatId0, customHeartbeatId1]);
      }
    );

    apiTest(
      'get many monitors - gets monitors from all spaces',
      async ({ apiClient, apiServices, kbnClient }) => {
        const SPACE_ID = `test-space-${uuidv4()}`;
        const SPACE_NAME = `test-space-name ${uuidv4()}`;
        await kbnClient.spaces.create({ id: SPACE_ID, name: SPACE_NAME });
        spacesToCleanUp.push(SPACE_ID);
        const spaceScopedPrivateLocation =
          await apiServices.syntheticsPrivateLocations.addTestPrivateLocation(SPACE_ID);

        const runId = uuidv4();
        const defaultSpaceCount = monitors.length;
        const otherSpaceCount = monitors.length * 2;

        for (let i = 0; i < defaultSpaceCount; i++) {
          await saveMonitor(apiClient, {
            ...monitors[i % monitors.length],
            name: `default-${runId}-${i}`,
            locations: [privateLocation],
          });
        }

        const otherMonitors = [...monitors, ...monitors];
        for (let i = 0; i < otherSpaceCount; i++) {
          await saveMonitor(
            apiClient,
            {
              ...otherMonitors[i],
              name: `other-${runId}-${i}`,
              locations: [spaceScopedPrivateLocation],
              spaces: [],
            },
            SPACE_ID
          );
        }

        const tagged = (mon: ListedMonitor) =>
          typeof mon.name === 'string' && mon.name.includes(runId);

        const withoutAll = await listMonitors(apiClient, editorHeaders, 'page=1&perPage=1000');
        const withoutAllMonitors = (withoutAll.body.monitors as ListedMonitor[]).filter(tagged);
        expect(withoutAllMonitors.filter(({ spaceId }) => spaceId === 'default')).toHaveLength(
          defaultSpaceCount
        );
        expect(withoutAllMonitors.filter(({ spaceId }) => spaceId === SPACE_ID)).toHaveLength(0);

        const withAll = await listMonitors(
          apiClient,
          editorHeaders,
          'page=1&perPage=1000&showFromAllSpaces=true'
        );
        const withAllMonitors = (withAll.body.monitors as ListedMonitor[]).filter(tagged);
        expect(withAllMonitors.filter(({ spaceId }) => spaceId === 'default')).toHaveLength(
          defaultSpaceCount
        );
        expect(withAllMonitors.filter(({ spaceId }) => spaceId === SPACE_ID)).toHaveLength(
          otherSpaceCount
        );
      }
    );

    apiTest('get one monitor - should get by id', async ({ apiClient }) => {
      const uuid = uuidv4();
      const saved: Array<Record<string, unknown> & { id: string }> = [];
      for (let i = 0; i < monitors.length; i++) {
        saved.push(
          await saveMonitor(apiClient, {
            ...monitors[i],
            name: `${String(monitors[i].name)}-${uuid}-${i}`,
          })
        );
      }
      const [{ id: id1 }] = saved;

      const apiResponse = await getMonitor(apiClient, editorHeaders, id1);

      expect(apiResponse.body).toStrictEqual(
        omitMonitorKeys({
          ...monitors[0],
          [ConfigKey.MONITOR_QUERY_ID]: (apiResponse.body as { id: string }).id,
          [ConfigKey.CONFIG_ID]: (apiResponse.body as { id: string }).id,
          revision: 1,
          locations: [privateLocation],
          name: `${String(monitors[0].name)}-${uuid}-0`,
          spaces: ['default'],
        })
      );
    });

    apiTest('get one monitor - should get by id with ui query param', async ({ apiClient }) => {
      const uuid = uuidv4();
      const saved: Array<Record<string, unknown> & { id: string }> = [];
      for (let i = 0; i < monitors.length; i++) {
        saved.push(
          await saveMonitor(apiClient, {
            ...monitors[i],
            name: `${String(monitors[i].name)}-${uuid}-${i}`,
          })
        );
      }
      const [{ id: id1 }] = saved;

      const apiResponse = await getMonitor(apiClient, editorHeaders, id1, { internal: true });

      expect(apiResponse.body).toStrictEqual(
        omit(
          {
            ...monitors[0],
            form_monitor_type: 'icmp',
            revision: 1,
            locations: [privateLocation],
            name: `${String(monitors[0].name)}-${uuid}-0`,
            hosts: '192.33.22.111:3333',
            hash: '',
            journey_id: '',
            max_attempts: 2,
            labels: {},
            maintenance_windows: [],
            spaces: ['default'],
          },
          ['config_id', 'id', 'form_monitor_type']
        )
      );
    });

    apiTest('get one monitor - returns 404 if monitor id is not found', async ({ apiClient }) => {
      const invalidMonitorId = 'invalid-id';
      const expected404Message = `Monitor id ${invalidMonitorId} not found!`;

      const getResponse = await getMonitor(apiClient, editorHeaders, invalidMonitorId, {
        statusCode: 404,
      });
      expect((getResponse.body as { message: string }).message).toBe(expected404Message);
    });

    apiTest('get one monitor - validates param length', async ({ apiClient }) => {
      const veryLargeMonId = new Array(1050).fill('1').join('');
      await getMonitor(apiClient, editorHeaders, veryLargeMonId, { statusCode: 400 });
    });
  }
);
