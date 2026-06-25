/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { omit } from 'lodash';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture } from '@kbn/scout-oblt';
import { ConfigKey } from '../../../../common/runtime_types';
import {
  apiTest,
  LOCAL_PUBLIC_LOCATION,
  mergeSyntheticsApiHeaders,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../fixtures';
import {
  editMonitorInternal,
  enableSynthetics,
  getMonitor,
  omitEmptyValues,
  omitResponseTimestamps,
  saveMonitorInternal,
} from '../fixtures/monitors';
import { httpMonitorFixture } from '../fixtures/data/http_monitor';

const isValidDate = (value: unknown) => !Number.isNaN(new Date(value as string).getTime());

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/edit_monitor.ts`.
 *
 * Uses the Elastic-managed `dev` public location. Tests share worker-scoped
 * Kibana state and run sequentially, matching the original `describe`.
 */
apiTest.describe(
  'EditMonitorAPI - Public Location',
  {
    tag: ['@local-stateful-classic', '@local-serverless-observability_complete'],
  },
  () => {
    let editorHeaders: Record<string, string>;
    // The FTR `http_monitor.json` fixture carried the Elastic-managed `dev`
    // public location; the migrated fixture omits it, so add it back here.
    // A monitor with zero locations is rejected with a 400 (LOCATION_REQUIRED_ERROR).
    const httpMonitorJson: Record<string, unknown> = {
      ...httpMonitorFixture,
      locations: [LOCAL_PUBLIC_LOCATION],
    };
    const spacesToCleanUp: string[] = [];

    const saveMonitor = async (
      apiClient: ApiClientFixture,
      monitor: Record<string, unknown>,
      spaceId?: string
    ) => {
      const res = await saveMonitorInternal(apiClient, editorHeaders, monitor, { spaceId });
      const { url, created_at: createdAt, updated_at: updatedAt, ...rest } = res.body;
      expect([isValidDate(createdAt), isValidDate(updatedAt)]).toStrictEqual([true, true]);
      return rest as Record<string, unknown>;
    };

    const editMonitor = async (
      apiClient: ApiClientFixture,
      monitor: Record<string, unknown>,
      monitorId: string
    ) => {
      const res = await editMonitorInternal(apiClient, editorHeaders, monitorId, monitor);
      const { created_at: createdAt, updated_at: updatedAt } = res.body;
      expect([isValidDate(createdAt), isValidDate(updatedAt)]).toStrictEqual([true, true]);
      return omitResponseTimestamps(res.body) as Record<string, unknown>;
    };

    apiTest.beforeAll(async ({ requestAuth, apiClient, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
      await enableSynthetics(apiClient, editorHeaders);
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      for (const spaceId of spacesToCleanUp) {
        await kbnClient.spaces.delete(spaceId).catch(() => {});
      }
      spacesToCleanUp.length = 0;
    });

    apiTest('edits the monitor', async ({ apiClient }) => {
      const newMonitor = httpMonitorJson;
      const savedMonitor = await saveMonitor(apiClient, newMonitor);
      const monitorId = savedMonitor[ConfigKey.CONFIG_ID] as string;

      expect(omitResponseTimestamps(savedMonitor)).toStrictEqual(
        omitEmptyValues({
          ...newMonitor,
          [ConfigKey.MONITOR_QUERY_ID]: monitorId,
          [ConfigKey.CONFIG_ID]: monitorId,
        })
      );

      const updates = {
        [ConfigKey.URLS]: 'https://modified-host.com',
        [ConfigKey.NAME]: 'Modified name',
        [ConfigKey.REQUEST_HEADERS_CHECK]: {
          sampleHeader2: 'sampleValue2',
        },
        [ConfigKey.METADATA]: {
          script_source: {
            is_generated_script: false,
            file_name: 'test-file.name',
          },
        },
      };

      const modifiedMonitor = {
        ...savedMonitor,
        ...updates,
        [ConfigKey.METADATA]: {
          ...(newMonitor[ConfigKey.METADATA] as object),
          ...updates[ConfigKey.METADATA],
        },
      };

      const editResponse = await editMonitor(apiClient, modifiedMonitor, monitorId);

      expect(editResponse).toStrictEqual(
        omitEmptyValues({
          ...modifiedMonitor,
          revision: 2,
        })
      );
    });

    apiTest(
      'persists deletion of label and header keys instead of deep-merging them',
      async ({ apiClient }) => {
        // Regression test for #274387. `labels` is a top-level map attribute, so a
        // deep-merging saved-object update silently kept removed keys and they could
        // never be deleted. Headers live in the encrypted `secrets` string (replaced
        // wholesale), so they already worked; asserting them here guards that the
        // full-attribute replacement keeps round-tripping secrets. The edit *response*
        // is built from the in-memory monitor and looks correct even when persistence
        // is broken, so this asserts a subsequent GET.
        const savedMonitor = await saveMonitor(apiClient, {
          ...httpMonitorJson,
          name: 'monitor with maps to prune',
          [ConfigKey.LABELS]: { team: 'obs', env: 'prod' },
          [ConfigKey.REQUEST_HEADERS_CHECK]: {
            sampleHeader: 'sampleHeaderValue',
            extra: 'extraValue',
          },
        });
        const monitorId = savedMonitor[ConfigKey.CONFIG_ID] as string;

        const toUpdate = {
          ...savedMonitor,
          [ConfigKey.LABELS]: { team: 'obs' },
          [ConfigKey.REQUEST_HEADERS_CHECK]: { sampleHeader: 'sampleHeaderValue' },
        };
        await editMonitorInternal(apiClient, editorHeaders, monitorId, toUpdate);

        const { body } = await getMonitor(apiClient, editorHeaders, monitorId, {
          internal: true,
        });
        expect(body[ConfigKey.LABELS]).toStrictEqual({ team: 'obs' });
        expect(body[ConfigKey.REQUEST_HEADERS_CHECK]).toStrictEqual({
          sampleHeader: 'sampleHeaderValue',
        });
      }
    );

    apiTest('strips unknown keys from monitor edits', async ({ apiClient }) => {
      const newMonitor = { ...httpMonitorJson, name: 'yet another' };

      const savedMonitor = await saveMonitor(apiClient, newMonitor);
      const monitorId = savedMonitor[ConfigKey.CONFIG_ID] as string;

      expect(omitResponseTimestamps(savedMonitor)).toStrictEqual(
        omitEmptyValues({
          ...newMonitor,
          [ConfigKey.MONITOR_QUERY_ID]: monitorId,
          [ConfigKey.CONFIG_ID]: monitorId,
        })
      );

      const updates = {
        [ConfigKey.URLS]: 'https://modified-host.com',
        [ConfigKey.NAME]: 'Modified name like that',
        [ConfigKey.REQUEST_HEADERS_CHECK]: {
          sampleHeader2: 'sampleValue2',
        },
        [ConfigKey.METADATA]: {
          script_source: {
            is_generated_script: false,
            file_name: 'test-file.name',
          },
        },
        unknownkey: 'unknownvalue',
      };

      const modifiedMonitor = omit(
        {
          ...updates,
          [ConfigKey.METADATA]: {
            ...((newMonitor as Record<string, unknown>)[ConfigKey.METADATA] as object),
            ...updates[ConfigKey.METADATA],
          },
        },
        ['unknownkey']
      );

      const editResponse = await editMonitor(apiClient, modifiedMonitor, monitorId);

      expect(editResponse).toStrictEqual(
        omitEmptyValues({
          ...savedMonitor,
          ...modifiedMonitor,
          revision: 2,
        })
      );
      expect(Object.keys(editResponse)).not.toContain('unknownkey');
    });

    apiTest('returns 404 if monitor id is not present', async ({ apiClient }) => {
      const invalidMonitorId = 'invalid-id';
      const expected404Message = `Monitor id ${invalidMonitorId} not found!`;

      const res = await editMonitorInternal(
        apiClient,
        editorHeaders,
        invalidMonitorId,
        httpMonitorJson,
        { statusCode: 404 }
      );
      expect((res.body as { message: string }).message).toBe(expected404Message);
    });

    apiTest('returns bad request if payload is invalid for HTTP monitor', async ({ apiClient }) => {
      const { id: monitorId, ...savedMonitor } = await saveMonitor(apiClient, httpMonitorJson);

      const toUpdate = { ...savedMonitor, 'check.request.headers': null };
      await editMonitorInternal(apiClient, editorHeaders, monitorId as string, toUpdate, {
        statusCode: 400,
      });
    });

    apiTest('returns bad request if monitor type is invalid', async ({ apiClient }) => {
      const { id: monitorId, ...savedMonitor } = await saveMonitor(apiClient, {
        ...httpMonitorJson,
        name: 'test monitor - 11',
      });

      const toUpdate = { ...savedMonitor, type: 'invalid-data-steam' };
      const res = await editMonitorInternal(
        apiClient,
        editorHeaders,
        monitorId as string,
        toUpdate,
        { statusCode: 400 }
      );
      expect((res.body as { message: string }).message).toBe(
        'Monitor type cannot be changed from http to invalid-data-steam.'
      );
    });

    apiTest('sets config hash to empty string on edits', async ({ apiClient }) => {
      const newMonitor = httpMonitorJson;
      const configHash = 'djrhefje';

      const savedMonitor = await saveMonitor(apiClient, {
        ...newMonitor,
        [ConfigKey.CONFIG_HASH]: configHash,
        name: 'test monitor - 12',
      });
      const monitorId = savedMonitor[ConfigKey.CONFIG_ID] as string;

      expect(savedMonitor).toStrictEqual(
        omitEmptyValues({
          ...newMonitor,
          [ConfigKey.CONFIG_ID]: monitorId,
          [ConfigKey.MONITOR_QUERY_ID]: monitorId,
          name: 'test monitor - 12',
          hash: configHash,
        })
      );

      const updates = {
        [ConfigKey.URLS]: 'https://modified-host.com',
        name: 'test monitor - 12',
      };

      const modifiedMonitor = {
        ...newMonitor,
        ...updates,
        [ConfigKey.METADATA]: {
          ...(newMonitor[ConfigKey.METADATA] as object),
        },
      };

      const editResponse = await editMonitor(apiClient, modifiedMonitor, monitorId);

      expect(editResponse).toStrictEqual(
        omitEmptyValues({
          ...modifiedMonitor,
          [ConfigKey.CONFIG_ID]: monitorId,
          [ConfigKey.MONITOR_QUERY_ID]: monitorId,
          [ConfigKey.CONFIG_HASH]: '',
          revision: 2,
        })
      );
      expect(Object.keys(editResponse)).not.toContain('unknownkey');
    });

    apiTest('handles spaces', async ({ apiClient, kbnClient }) => {
      const name = 'Monitor with private location';
      const SPACE_ID = `test-space-${uuidv4()}`;
      const SPACE_NAME = `test-space-name ${uuidv4()}`;
      await kbnClient.spaces.create({ id: SPACE_ID, name: SPACE_NAME });
      spacesToCleanUp.push(SPACE_ID);

      const newMonitor = {
        name,
        type: 'http',
        urls: 'https://elastic.co',
        locations: [LOCAL_PUBLIC_LOCATION],
      };

      const savedMonitor = await saveMonitor(apiClient, newMonitor, SPACE_ID);
      const monitorId = savedMonitor[ConfigKey.CONFIG_ID] as string;

      const toUpdate = { ...savedMonitor, urls: 'https://google.com' };
      await editMonitorInternal(apiClient, editorHeaders, monitorId, toUpdate, {
        spaceId: SPACE_ID,
      });

      const updatedResponse = await getMonitor(apiClient, editorHeaders, monitorId, {
        space: SPACE_ID,
        internal: true,
      });
      expect((updatedResponse.body as { urls: string }).urls).toBe(toUpdate.urls);

      // update a second time, ensures AAD was not corrupted
      const toUpdate2 = { ...savedMonitor, urls: 'https://google.com' };
      await editMonitorInternal(apiClient, editorHeaders, monitorId, toUpdate2, {
        spaceId: SPACE_ID,
      });

      const updatedResponse2 = await getMonitor(apiClient, editorHeaders, monitorId, {
        space: SPACE_ID,
        internal: true,
      });
      expect((updatedResponse2.body as { urls: string }).urls).toBe(toUpdate2.urls);
    });
  }
);
