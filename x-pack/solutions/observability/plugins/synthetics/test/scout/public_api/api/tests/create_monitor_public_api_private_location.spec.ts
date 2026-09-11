/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
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
  omitMonitorKeys,
  parseMonitorResponse,
} from '../../../common/fixtures/monitors';

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/create_monitor_public_api_private_location.ts`.
 *
 * Validation cases and per-type create cases share a single private location.
 * The FTR file grouped the create cases under per-type nested `describe`s;
 * Scout keeps a flat suite.
 */
apiTest.describe(
  'AddNewMonitorsPublicAPI - Private locations',
  {
    tag: [...tags.stateful.classic, ...tags.serverless.observability.complete],
  },
  () => {
    let editorHeaders: Record<string, string>;
    let privateLocation: ScoutPrivateLocation;

    apiTest.beforeAll(async ({ requestAuth, apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
      privateLocation = await apiServices.syntheticsPrivateLocations.getSharedPrivateLocation();
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
    });

    apiTest('should return error for empty monitor', async ({ apiClient }) => {
      const res = await addMonitor(apiClient, editorHeaders, {}, { statusCode: 400 });
      expect((res.body as { message: string }).message).toBe(
        'Invalid value "undefined" supplied to "type"'
      );
    });

    apiTest('return error if no location specified', async ({ apiClient }) => {
      const res = await addMonitor(apiClient, editorHeaders, { type: 'http' }, { statusCode: 400 });
      expect((res.body as { message: string }).message).toBe(LOCATION_REQUIRED_ERROR);
    });

    apiTest('return error if invalid location specified', async ({ apiClient }) => {
      const res = await addMonitor(
        apiClient,
        editorHeaders,
        { type: 'http', locations: ['mars'] },
        { statusCode: 400 }
      );
      expect((res.body as { message: string }).message).toContain(
        "Invalid locations specified. Elastic managed Location(s) 'mars' not found."
      );
    });

    apiTest('return error if invalid private location specified', async ({ apiClient }) => {
      const wrongKey = await addMonitor(
        apiClient,
        editorHeaders,
        { type: 'http', locations: ['mars'], privateLocations: ['moon'] },
        { statusCode: 400 }
      );
      expect((wrongKey.body as { message: string }).message).toBe(
        'Invalid monitor key(s) for http type:  privateLocations'
      );

      const notFound = await addMonitor(
        apiClient,
        editorHeaders,
        { type: 'http', locations: ['mars'], private_locations: ['moon'] },
        { statusCode: 400 }
      );
      expect((notFound.body as { message: string }).message).toContain(
        "Private Location(s) 'moon' not found."
      );
    });

    apiTest('return error for origin project', async ({ apiClient }) => {
      const res = await addMonitor(
        apiClient,
        editorHeaders,
        { type: 'http', locations: ['dev'], url: 'https://www.google.com', origin: 'project' },
        { statusCode: 400 }
      );
      expect((res.body as { message: string }).message).toBe(
        'Unsupported origin type project, only ui type is supported via API.'
      );
    });

    apiTest('HTTP - returns error for empty http', async ({ apiClient }) => {
      const res = await addMonitor(
        apiClient,
        editorHeaders,
        { type: 'http', locations: [], private_locations: [privateLocation.id] },
        { statusCode: 400 }
      );
      const body = res.body as { message: string; attributes: unknown };
      expect(body.message).toBe('Monitor is not a valid monitor of type http');
      expect(body.attributes).toStrictEqual({
        details:
          'Invalid field "url", must be a non-empty string. | Invalid value "undefined" supplied to "name"',
        payload: { type: 'http' },
      });
    });

    apiTest('HTTP - base http monitor', async ({ apiClient }) => {
      const monitor = {
        type: 'http',
        private_locations: [privateLocation.id],
        url: 'https://www.google.com',
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...DEFAULT_FIELDS.http,
          ...monitor,
          locations: [privateLocation],
          name: 'https://www.google.com',
          spaces: ['default'],
        })
      );
    });

    apiTest('HTTP - can enable retries', async ({ apiClient }) => {
      const name = `test name ${uuidv4()}`;
      const monitor = {
        type: 'http',
        private_locations: [privateLocation.id],
        url: 'https://www.google.com',
        name,
        retest_on_failure: true,
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...DEFAULT_FIELDS.http,
          ...monitor,
          locations: [privateLocation],
          name,
          retest_on_failure: true,
          spaces: ['default'],
        })
      );
    });

    apiTest('HTTP - can disable retries', async ({ apiClient }) => {
      const name = `test name ${uuidv4()}`;
      const monitor = {
        type: 'http',
        private_locations: [privateLocation.id],
        url: 'https://www.google.com',
        name,
        retest_on_failure: false,
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...DEFAULT_FIELDS.http,
          ...monitor,
          locations: [privateLocation],
          name,
          max_attempts: 1,
          // this key is not part of the SO and should not be defined
          retest_on_failure: undefined,
          spaces: ['default'],
        })
      );
    });

    apiTest('TCP - base tcp monitor', async ({ apiClient }) => {
      const monitor = {
        type: 'tcp',
        private_locations: [privateLocation.id],
        host: 'https://www.google.com/',
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...DEFAULT_FIELDS.tcp,
          ...monitor,
          locations: [privateLocation],
          name: 'https://www.google.com/',
          spaces: ['default'],
        })
      );
    });

    apiTest('ICMP - base icmp monitor', async ({ apiClient }) => {
      const monitor = {
        type: 'icmp',
        private_locations: [privateLocation.id],
        host: 'https://8.8.8.8',
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...DEFAULT_FIELDS.icmp,
          ...monitor,
          locations: [privateLocation],
          name: 'https://8.8.8.8',
          spaces: ['default'],
        })
      );
    });

    apiTest('Browser - returns error for empty browser monitor', async ({ apiClient }) => {
      const res = await addMonitor(
        apiClient,
        editorHeaders,
        { type: 'browser', private_locations: [privateLocation.id], name: 'simple journey' },
        { statusCode: 400 }
      );

      expect(res.body).toStrictEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Monitor is not a valid monitor of type browser',
        attributes: {
          details: 'source.inline.script: Script is required for browser monitor.',
          payload: { type: 'browser', name: 'simple journey' },
        },
      });
    });

    apiTest('Browser - base browser monitor', async ({ apiClient }) => {
      const monitor = {
        type: 'browser',
        private_locations: [privateLocation.id],
        name: 'simple journey',
        'source.inline.script': 'step("simple journey", async () => {});',
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...DEFAULT_FIELDS.browser,
          ...monitor,
          locations: [privateLocation],
          spaces: ['default'],
        })
      );
    });

    apiTest('Browser - base browser monitor with inline_script', async ({ apiClient }) => {
      const monitor = {
        type: 'browser',
        private_locations: [privateLocation.id],
        name: 'simple journey inline_script',
        inline_script: 'step("simple journey", async () => {});',
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...DEFAULT_FIELDS.browser,
          ...monitor,
          locations: [privateLocation],
          spaces: ['default'],
        })
      );
    });
  }
);
