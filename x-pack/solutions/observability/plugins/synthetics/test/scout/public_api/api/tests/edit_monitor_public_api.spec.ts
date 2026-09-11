/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout-oblt/api';
import { DEFAULT_FIELDS } from '../../../../../common/constants/monitor_defaults';
import {
  apiTest,
  LOCAL_PUBLIC_LOCATION,
  mergeSyntheticsApiHeaders,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../../../common/fixtures';
import {
  addMonitor,
  editMonitor,
  omitMonitorKeys,
  parseMonitorResponse,
} from '../../../common/fixtures/monitors';

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/edit_monitor_public_api.ts`.
 *
 * This suite edits a single monitor across successive `test()` blocks, so the
 * revision counter increments through the file. Scout API specs share
 * worker-scoped Kibana state and run in file order, so the chain behaves like
 * the original FTR `describe` that relied on shared state between `it`s.
 */
apiTest.describe(
  'EditMonitorsPublicAPI - Public location',
  {
    tag: ['@local-stateful-classic', '@local-serverless-observability_complete'],
  },
  () => {
    const defaultFields = DEFAULT_FIELDS.http;
    let editorHeaders: Record<string, string>;
    let monitorId = 'test-id';
    const updates: Record<string, unknown> = {};

    apiTest.beforeAll(async ({ requestAuth, apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
      await apiServices.syntheticsPrivateLocations.installSyntheticsPackage();
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
    });

    apiTest('adds test monitor', async ({ apiClient }) => {
      const monitor = {
        type: 'http',
        locations: [LOCAL_PUBLIC_LOCATION.id],
        url: 'https://www.google.com',
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);
      monitorId = (res.body as { id: string }).id;

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...defaultFields,
          ...monitor,
          locations: [LOCAL_PUBLIC_LOCATION],
          name: 'https://www.google.com',
          spaces: ['default'],
        })
      );
    });

    apiTest('can change name of monitor', async ({ apiClient }) => {
      updates.name = `updated name ${uuidv4()}`;
      const monitor = { name: updates.name };
      const res = await editMonitor(apiClient, editorHeaders, monitorId, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...defaultFields,
          ...monitor,
          ...updates,
          locations: [LOCAL_PUBLIC_LOCATION],
          revision: 2,
          url: 'https://www.google.com',
          spaces: ['default'],
        })
      );
    });

    apiTest('prevents duplicate name of monitor', async ({ apiClient }) => {
      const name = `test name ${uuidv4()}`;
      const monitor = {
        name,
        type: 'http',
        locations: [LOCAL_PUBLIC_LOCATION.id],
        url: 'https://www.google.com',
      };
      // create one monitor with one name
      await addMonitor(apiClient, editorHeaders, monitor);
      // create another monitor with a different name
      const res = await addMonitor(apiClient, editorHeaders, { ...monitor, name: 'test name' });
      const newMonitorId = (res.body as { id: string }).id;

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...defaultFields,
          ...monitor,
          locations: [LOCAL_PUBLIC_LOCATION],
          name: 'test name',
          spaces: ['default'],
        })
      );

      const editResult = await editMonitor(
        apiClient,
        editorHeaders,
        newMonitorId,
        { name },
        { statusCode: 400 }
      );

      expect(editResult.body).toStrictEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: `Monitor name must be unique, "${name}" already exists.`,
        attributes: {
          details: `Monitor name must be unique, "${name}" already exists.`,
        },
      });
    });

    apiTest('can add a second public location to existing monitor', async ({ apiClient }) => {
      const monitor = { locations: [LOCAL_PUBLIC_LOCATION.id, 'dev2'] };
      const res = await editMonitor(apiClient, editorHeaders, monitorId, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...defaultFields,
          ...updates,
          revision: 3,
          url: 'https://www.google.com',
          locations: [
            LOCAL_PUBLIC_LOCATION,
            { ...LOCAL_PUBLIC_LOCATION, id: 'dev2', label: 'Dev Service 2' },
          ],
          spaces: ['default'],
        })
      );
    });

    apiTest('can remove public location from existing monitor', async ({ apiClient }) => {
      const monitor = { locations: ['dev2'] };
      const res = await editMonitor(apiClient, editorHeaders, monitorId, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...defaultFields,
          ...updates,
          revision: 4,
          url: 'https://www.google.com',
          locations: [{ ...LOCAL_PUBLIC_LOCATION, id: 'dev2', label: 'Dev Service 2' }],
          spaces: ['default'],
        })
      );
    });

    apiTest('can set schedule to 2 minutes', async ({ apiClient }) => {
      const res = await editMonitor(apiClient, editorHeaders, monitorId, { schedule: 2 });
      expect((res.body as { schedule: unknown }).schedule).toStrictEqual({
        number: '2',
        unit: 'm',
      });
    });

    apiTest('can set schedule to 20 minutes', async ({ apiClient }) => {
      const res = await editMonitor(apiClient, editorHeaders, monitorId, { schedule: 20 });
      expect((res.body as { schedule: unknown }).schedule).toStrictEqual({
        number: '20',
        unit: 'm',
      });
    });
  }
);
