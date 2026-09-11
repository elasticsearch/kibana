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
  getMonitor,
  omitMonitorKeys,
  parseMonitorResponse,
} from '../../../common/fixtures/monitors';

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/create_monitor_public_api.ts`.
 *
 * The FTR file grouped cases under per-type nested `describe`s; Scout keeps a
 * flat suite (one describe, one `test` per case). The FTR `skipCloud`/`skipMKI`
 * tags map to local stateful + serverless coverage.
 */
apiTest.describe(
  'AddNewMonitorsPublicAPI - Public locations',
  {
    tag: ['@local-stateful-classic', '@local-serverless-observability_complete'],
  },
  () => {
    let editorHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ requestAuth, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
    });

    apiTest('HTTP - returns error for empty monitor', async ({ apiClient }) => {
      const res = await addMonitor(
        apiClient,
        editorHeaders,
        { type: 'http', locations: [LOCAL_PUBLIC_LOCATION.id], private_locations: [] },
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
        locations: [LOCAL_PUBLIC_LOCATION.id],
        url: 'https://www.google.com',
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...DEFAULT_FIELDS.http,
          ...monitor,
          locations: [LOCAL_PUBLIC_LOCATION],
          name: 'https://www.google.com',
          spaces: ['default'],
        })
      );
    });

    apiTest('HTTP - can enable retries', async ({ apiClient }) => {
      const name = `test name ${uuidv4()}`;
      const monitor = {
        type: 'http',
        locations: [LOCAL_PUBLIC_LOCATION.id],
        url: 'https://www.google.com',
        name,
        retest_on_failure: true,
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...DEFAULT_FIELDS.http,
          ...monitor,
          locations: [LOCAL_PUBLIC_LOCATION],
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
        locations: [LOCAL_PUBLIC_LOCATION.id],
        url: 'https://www.google.com',
        name,
        retest_on_failure: false,
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...DEFAULT_FIELDS.http,
          ...monitor,
          locations: [LOCAL_PUBLIC_LOCATION],
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
        locations: [LOCAL_PUBLIC_LOCATION.id],
        host: 'https://www.google.com/',
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...DEFAULT_FIELDS.tcp,
          ...monitor,
          locations: [LOCAL_PUBLIC_LOCATION],
          name: 'https://www.google.com/',
          spaces: ['default'],
        })
      );
    });

    apiTest('ICMP - base icmp monitor', async ({ apiClient }) => {
      const monitor = {
        type: 'icmp',
        locations: [LOCAL_PUBLIC_LOCATION.id],
        host: 'https://8.8.8.8',
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...DEFAULT_FIELDS.icmp,
          ...monitor,
          locations: [LOCAL_PUBLIC_LOCATION],
          name: 'https://8.8.8.8',
          spaces: ['default'],
        })
      );
    });

    apiTest('Browser - returns error for empty browser monitor', async ({ apiClient }) => {
      const res = await addMonitor(
        apiClient,
        editorHeaders,
        { type: 'browser', locations: [LOCAL_PUBLIC_LOCATION.id], name: 'simple journey' },
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
        locations: [LOCAL_PUBLIC_LOCATION.id],
        name: 'simple journey',
        'source.inline.script': 'step("simple journey", async () => {});',
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...DEFAULT_FIELDS.browser,
          ...monitor,
          locations: [LOCAL_PUBLIC_LOCATION],
          spaces: ['default'],
        })
      );
    });

    apiTest('Browser - base browser monitor with inline_script', async ({ apiClient }) => {
      const monitor = {
        type: 'browser',
        locations: [LOCAL_PUBLIC_LOCATION.id],
        name: 'simple journey inline_script',
        inline_script: 'step("simple journey", async () => {});',
      };
      const res = await addMonitor(apiClient, editorHeaders, monitor);

      expect(parseMonitorResponse(res.body as Record<string, unknown>)).toStrictEqual(
        omitMonitorKeys({
          ...DEFAULT_FIELDS.browser,
          ...monitor,
          locations: [LOCAL_PUBLIC_LOCATION],
          spaces: ['default'],
        })
      );
    });

    apiTest('HTTP - schedule number 3 is stored as minutes', async ({ apiClient }) => {
      const name = `schedule number ${uuidv4()}`;
      const res = await addMonitor(apiClient, editorHeaders, {
        type: 'http',
        locations: [LOCAL_PUBLIC_LOCATION.id],
        url: 'https://www.google.com',
        name,
        schedule: 3,
      });
      const id = (res.body as { id: string }).id;
      expect((res.body as { schedule: unknown }).schedule).toStrictEqual({
        number: '3',
        unit: 'm',
      });
      const got = await getMonitor(apiClient, editorHeaders, id);
      expect((got.rawBody as { schedule: unknown }).schedule).toStrictEqual({
        number: '3',
        unit: 'm',
      });
    });

    apiTest('HTTP - schedule string 10s is stored as seconds', async ({ apiClient }) => {
      const name = `schedule 10s ${uuidv4()}`;
      const res = await addMonitor(apiClient, editorHeaders, {
        type: 'http',
        locations: [LOCAL_PUBLIC_LOCATION.id],
        url: 'https://www.google.com',
        name,
        schedule: '10s',
      });
      const id = (res.body as { id: string }).id;
      expect((res.body as { schedule: unknown }).schedule).toStrictEqual({
        number: '10',
        unit: 's',
      });
      const got = await getMonitor(apiClient, editorHeaders, id);
      expect((got.rawBody as { schedule: unknown }).schedule).toStrictEqual({
        number: '10',
        unit: 's',
      });
    });

    apiTest('HTTP - schedule object 10 seconds is stored as seconds', async ({ apiClient }) => {
      const name = `schedule object 10s ${uuidv4()}`;
      const res = await addMonitor(apiClient, editorHeaders, {
        type: 'http',
        locations: [LOCAL_PUBLIC_LOCATION.id],
        url: 'https://www.google.com',
        name,
        schedule: { number: '10', unit: 's' },
      });
      const id = (res.body as { id: string }).id;
      expect((res.body as { schedule: unknown }).schedule).toStrictEqual({
        number: '10',
        unit: 's',
      });
      const got = await getMonitor(apiClient, editorHeaders, id);
      expect((got.rawBody as { schedule: unknown }).schedule).toStrictEqual({
        number: '10',
        unit: 's',
      });
    });

    apiTest('HTTP - schedule object 5 seconds is rejected', async ({ apiClient }) => {
      const res = await addMonitor(
        apiClient,
        editorHeaders,
        {
          type: 'http',
          locations: [LOCAL_PUBLIC_LOCATION.id],
          url: 'https://www.google.com',
          name: `schedule object 5s ${uuidv4()}`,
          schedule: { number: '5', unit: 's' },
        },
        { statusCode: 400 }
      );
      const body = res.body as { message: string; attributes: { details: string } };
      expect(body.message).toBe('Monitor schedule is invalid');
      expect(body.attributes.details).toContain('5s');
    });
  }
);
