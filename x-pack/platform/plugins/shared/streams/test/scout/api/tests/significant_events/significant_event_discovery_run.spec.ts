/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import { tags } from '@kbn/scout';
import { streamsApiTest as apiTest } from '../../fixtures';
import { PUBLIC_API_HEADERS } from '../../fixtures/constants';

apiTest.describe(
  'Significant Events discovery pipeline API',
  { tag: [...tags.stateful.classic] },
  () => {
    apiTest.beforeAll(async ({ apiServices }) => {
      await apiServices.streamsTest.enable();
      await apiServices.streamsTest.enableSignificantEvents();
    });

    apiTest.afterAll(async ({ apiServices }) => {
      // Only tear down the significant events sub-feature. The global streams
      // feature is enabled once in global.setup.ts and shared across every spec
      // in this serial lane, so disabling it here would break the streams specs
      // that run afterwards (they rely on the global setup and never re-enable).
      await apiServices.streamsTest.disableSignificantEvents();
    });

    apiTest('POST _execute (trigger) returns an executionId', async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asStreamsAdmin();

      const { statusCode, body } = await apiClient.post(
        'internal/streams/significant_events/discovery/_execute',
        {
          headers: { ...PUBLIC_API_HEADERS, ...cookieHeader },
          body: { action: 'trigger' },
          responseType: 'json',
        }
      );

      expect(statusCode).toBe(200);
      expect(body.executionId).toBeDefined();
      expect(typeof body.executionId).toBe('string');
    });

    apiTest('GET _status returns a valid status after trigger', async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asStreamsAdmin();

      // Trigger a run first so status is not_started
      await apiClient.post('internal/streams/significant_events/discovery/_execute', {
        headers: { ...PUBLIC_API_HEADERS, ...cookieHeader },
        body: { action: 'trigger' },
        responseType: 'json',
      });

      const { statusCode, body } = await apiClient.get(
        'internal/streams/significant_events/discovery/_status',
        {
          headers: { ...PUBLIC_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        }
      );

      expect(statusCode).toBe(200);
      expect(body.status).toBeDefined();
      expect(['not_started', 'in_progress', 'completed', 'failed', 'canceled']).toContain(
        body.status
      );
    });

    apiTest(
      'POST _execute (cancel) returns executionId or null',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asStreamsAdmin();

        const { statusCode, body } = await apiClient.post(
          'internal/streams/significant_events/discovery/_execute',
          {
            headers: { ...PUBLIC_API_HEADERS, ...cookieHeader },
            body: { action: 'cancel' },
            responseType: 'json',
          }
        );

        expect(statusCode).toBe(200);
        expect('executionId' in body).toBe(true);
        expect(body.executionId === null || typeof body.executionId === 'string').toBe(true);
      }
    );
  }
);
