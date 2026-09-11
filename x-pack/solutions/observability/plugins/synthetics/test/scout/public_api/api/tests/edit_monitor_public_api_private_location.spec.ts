/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { omit } from 'lodash';
import { expect } from '@kbn/scout-oblt/api';
import { tags } from '@kbn/scout-oblt';
import { DEFAULT_FIELDS } from '../../../../../common/constants/monitor_defaults';
import { LOCATION_REQUIRED_ERROR } from '../../../../../server/routes/monitor_cruds/monitor_validation';
import type { ScoutPrivateLocation } from '../../../common/services/synthetics_private_location_api_service';
import {
  apiTest,
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
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/edit_monitor_public_api_private_location.ts`.
 *
 * Validation cases run against a single monitor created up front, then the
 * happy-path edits walk that monitor through revisions 2-4. Scout API specs
 * share worker-scoped Kibana state and run in file order, so the chain behaves
 * like the original FTR `describe` that relied on shared state between `it`s.
 */
apiTest.describe(
  'EditMonitorsPublicAPI - Private Location',
  {
    tag: [...tags.stateful.classic, ...tags.serverless.observability.complete],
  },
  () => {
    const defaultFields = DEFAULT_FIELDS.http;
    let editorHeaders: Record<string, string>;
    let privateLocation1: ScoutPrivateLocation;
    let privateLocation2: ScoutPrivateLocation;
    let monitorId = 'test-id';
    const updates: Record<string, unknown> = {};

    apiTest.beforeAll(async ({ requestAuth, apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
      privateLocation1 = await apiServices.syntheticsPrivateLocations.getSharedPrivateLocation();
      privateLocation2 = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
    });

    apiTest('adds test monitor', async ({ apiClient }) => {
      const monitor = {
        type: 'http',
        private_locations: [privateLocation1.id],
        url: 'https://www.google.com',
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);
      monitorId = (res.body as { id: string }).id;

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...defaultFields,
          ...monitor,
          locations: [privateLocation1],
          name: 'https://www.google.com',
          spaces: ['default'],
        })
      );
    });

    apiTest('should return error for empty monitor', async ({ apiClient }) => {
      const errMessage = 'Monitor must be a non-empty object';
      const testCases = [{}, null, undefined, false, [], ''];
      for (const testCase of testCases) {
        const res = await editMonitor(apiClient, editorHeaders, monitorId, testCase, {
          statusCode: 400,
        });
        expect((res.body as { message: string }).message).toBe(errMessage);
      }
    });

    apiTest('return error if type is being changed', async ({ apiClient }) => {
      const res = await editMonitor(
        apiClient,
        editorHeaders,
        monitorId,
        { type: 'tcp' },
        {
          statusCode: 400,
        }
      );
      expect((res.body as { message: string }).message).toBe(
        'Monitor type cannot be changed from http to tcp.'
      );
    });

    apiTest('return error if monitor not found', async ({ apiClient }) => {
      const res = await editMonitor(
        apiClient,
        editorHeaders,
        'invalid-monitor-id',
        { type: 'tcp' },
        { statusCode: 404 }
      );
      expect((res.body as { message: string }).message).toBe(
        'Monitor id invalid-monitor-id not found!'
      );
    });

    apiTest('return error if invalid location specified', async ({ apiClient }) => {
      const res = await editMonitor(
        apiClient,
        editorHeaders,
        monitorId,
        { type: 'http', locations: ['mars'] },
        { statusCode: 400 }
      );
      expect((res.body as { message: string }).message).toContain(
        "Invalid locations specified. Elastic managed Location(s) 'mars' not found."
      );
    });

    apiTest('return error if invalid private location specified', async ({ apiClient }) => {
      const wrongKey = await editMonitor(
        apiClient,
        editorHeaders,
        monitorId,
        { type: 'http', locations: ['mars'], privateLocations: ['moon'] },
        { statusCode: 400 }
      );
      expect((wrongKey.body as { message: string }).message).toBe(
        'Invalid monitor key(s) for http type:  privateLocations'
      );

      const notFound = await editMonitor(
        apiClient,
        editorHeaders,
        monitorId,
        { type: 'http', locations: ['mars'], private_locations: ['moon'] },
        { statusCode: 400 }
      );
      expect((notFound.body as { message: string }).message).toContain(
        "Private Location(s) 'moon' not found."
      );
    });

    apiTest('throws an error if empty locations', async ({ apiClient }) => {
      const res = await editMonitor(
        apiClient,
        editorHeaders,
        monitorId,
        { locations: [], private_locations: [] },
        { statusCode: 400 }
      );
      expect((res.body as { message: string }).message).toBe(LOCATION_REQUIRED_ERROR);
    });

    apiTest('cannot change origin type', async ({ apiClient }) => {
      const res = await editMonitor(
        apiClient,
        editorHeaders,
        monitorId,
        { origin: 'project' },
        { statusCode: 400 }
      );

      expect(res.body).toStrictEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Unsupported origin type project, only ui type is supported via API.',
        attributes: {
          details: 'Unsupported origin type project, only ui type is supported via API.',
          payload: { origin: 'project' },
        },
      });
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
          locations: [privateLocation1],
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
        private_locations: [privateLocation1.id],
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
          locations: [privateLocation1],
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

    apiTest('can add a second private location to existing monitor', async ({ apiClient }) => {
      const monitor = { private_locations: [privateLocation1.id, privateLocation2.id] };
      const res = await editMonitor(apiClient, editorHeaders, monitorId, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...defaultFields,
          ...updates,
          revision: 3,
          url: 'https://www.google.com',
          locations: [omit(privateLocation1, 'spaces'), omit(privateLocation2, 'spaces')],
          spaces: ['default'],
        })
      );
    });

    apiTest('can remove private location from existing monitor', async ({ apiClient }) => {
      const monitor = { private_locations: [privateLocation2.id] };
      const res = await editMonitor(apiClient, editorHeaders, monitorId, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...defaultFields,
          ...updates,
          revision: 4,
          url: 'https://www.google.com',
          locations: [omit(privateLocation2, 'spaces')],
          spaces: ['default'],
        })
      );
    });

    apiTest('can not remove all locations', async ({ apiClient }) => {
      const res = await editMonitor(
        apiClient,
        editorHeaders,
        monitorId,
        { locations: [], private_locations: [] },
        { statusCode: 400 }
      );
      expect((res.body as { message: string }).message).toBe(LOCATION_REQUIRED_ERROR);
    });
  }
);
