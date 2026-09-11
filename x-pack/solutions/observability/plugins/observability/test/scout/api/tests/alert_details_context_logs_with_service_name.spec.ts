/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture } from '@kbn/scout-oblt';
import { apiTest } from '../fixtures';
import { ALERT_DETAILS_CONTEXT_API_PATH, INTERNAL_HEADERS } from '../fixtures/constants';
import {
  buildContextQuery,
  generateApmTraces,
  generateLogs,
  getLogCategories,
  getSampleMessage,
  getServiceSummary,
  type AlertDetailsContextResponse,
} from '../fixtures/alert_context_data';

const end = moment().valueOf();
const start = moment(end).subtract(10, 'minutes').valueOf();

apiTest.describe(
  'Observability alert details context when logs are annotated with service.name',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let headers: Record<string, string>;

    const fetchContext = async (apiClient: ApiClientFixture, query: Record<string, string>) => {
      const response = await apiClient.get(
        `${ALERT_DETAILS_CONTEXT_API_PATH}?${buildContextQuery({
          alert_started_at: new Date(end).toISOString(),
          ...query,
        })}`,
        { headers, responseType: 'json' }
      );
      expect(response).toHaveStatusCode(200);
      return (response.body as AlertDetailsContextResponse).alertContext;
    };

    apiTest.beforeAll(async ({ samlAuth, apmSynthtraceEsClient, logsSynthtraceEsClient }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
      headers = { ...INTERNAL_HEADERS, ...cookieHeader };

      await apmSynthtraceEsClient.clean();
      await logsSynthtraceEsClient.clean();

      await apmSynthtraceEsClient.index(
        generateApmTraces(
          { start, end },
          { 'service.name': 'Backend', 'container.id': 'my-container-a' }
        )
      );
      await logsSynthtraceEsClient.index(
        generateLogs(
          { start, end },
          {
            'service.name': 'Backend',
            'container.id': 'my-container-a',
            'kubernetes.pod.name': 'pod-a',
          }
        )
      );

      // Unrelated Frontend traces and logs that should not surface when fetching
      // "Backend"-related context.
      await apmSynthtraceEsClient.index(
        generateApmTraces(
          { start, end },
          { 'service.name': 'Frontend', 'container.id': 'my-container-b' }
        )
      );
      await logsSynthtraceEsClient.index(
        generateLogs(
          { start, end },
          {
            'service.name': 'Frontend',
            'container.id': 'my-container-b',
            'kubernetes.pod.name': 'pod-b',
          }
        )
      );

      // Logs that are not annotated with service.name.
      await logsSynthtraceEsClient.index(
        generateLogs(
          { start, end },
          { 'container.id': 'my-container-c', 'kubernetes.pod.name': 'pod-c' }
        )
      );
    });

    apiTest.afterAll(async ({ apmSynthtraceEsClient, logsSynthtraceEsClient }) => {
      await apmSynthtraceEsClient.clean();
      await logsSynthtraceEsClient.clean();
    });

    apiTest(
      'returns no service summary and no log categories when no params are specified',
      async ({ apiClient }) => {
        const alertContext = await fetchContext(apiClient, {});

        expect(getServiceSummary(alertContext)).toBeUndefined();
        expect(getLogCategories(alertContext)).toStrictEqual([]);
      }
    );

    apiTest(
      'returns Backend log categories when service.name is specified',
      async ({ apiClient }) => {
        const alertContext = await fetchContext(apiClient, { 'service.name': 'Backend' });

        const logCategories = getLogCategories(alertContext);
        expect(logCategories).toHaveLength(1);
        const [logCategory] = logCategories;
        expect(getSampleMessage(logCategory)).toMatch(/Error message #\d{16} from service Backend/);
        expect(logCategory.docCount).toBeGreaterThan(0);
        expect(logCategory.errorCategory).toBe('Error message from service Backend');
      }
    );

    apiTest(
      'returns Backend log categories when container.id is specified',
      async ({ apiClient }) => {
        const alertContext = await fetchContext(apiClient, { 'container.id': 'my-container-a' });

        const logCategories = getLogCategories(alertContext);
        expect(logCategories).toHaveLength(1);
        const [logCategory] = logCategories;
        expect(getSampleMessage(logCategory)).toMatch(/Error message #\d{16} from service Backend/);
        expect(logCategory.docCount).toBeGreaterThan(0);
        expect(logCategory.errorCategory).toBe('Error message from service Backend');
      }
    );

    apiTest(
      'returns an empty service summary and container log categories for a non-existing service.name',
      async ({ apiClient }) => {
        const alertContext = await fetchContext(apiClient, {
          'service.name': 'non-existing-service',
        });

        expect(getServiceSummary(alertContext)?.data).toStrictEqual({
          'service.name': 'non-existing-service',
          'service.environment': [],
          instances: 1,
          anomalies: [],
          alerts: [],
          deployments: [],
        });

        const logCategories = getLogCategories(alertContext);
        expect(logCategories).toHaveLength(1);
        expect(logCategories.map(({ errorCategory }) => errorCategory)).toStrictEqual([
          'Error message from container my-container-c',
        ]);
      }
    );
  }
);
