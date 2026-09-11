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
  getDownstreamDependencies,
  getLogCategories,
  getSampleMessage,
  getServiceSummary,
  type AlertDetailsContextResponse,
} from '../fixtures/alert_context_data';

const end = moment().valueOf();
const start = moment(end).subtract(10, 'minutes').valueOf();

apiTest.describe(
  'Observability alert details context when logs are not annotated with service.name',
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

      await Promise.all([
        apmSynthtraceEsClient.index(
          generateApmTraces(
            { start, end },
            { 'service.name': 'Backend', 'container.id': 'my-container-a' }
          )
        ),
        logsSynthtraceEsClient.index(
          generateLogs(
            { start, end },
            { 'container.id': 'my-container-a', 'kubernetes.pod.name': 'pod-a' }
          )
        ),
      ]);
    });

    apiTest.afterAll(async ({ apmSynthtraceEsClient, logsSynthtraceEsClient }) => {
      await apmSynthtraceEsClient.clean();
      await logsSynthtraceEsClient.clean();
    });

    apiTest('returns nothing when no params are specified', async ({ apiClient }) => {
      const alertContext = await fetchContext(apiClient, {});

      expect(alertContext).toStrictEqual([]);
    });

    apiTest(
      'returns service summary, downstream dependencies and log categories when service.name is specified',
      async ({ apiClient }) => {
        const alertContext = await fetchContext(apiClient, { 'service.name': 'Backend' });

        await apiTest.step('service summary', async () => {
          expect(getServiceSummary(alertContext)?.data).toStrictEqual({
            'service.name': 'Backend',
            'service.environment': ['production'],
            'agent.name': 'java',
            'service.version': ['1.0.0'],
            'language.name': 'java',
            instances: 1,
            anomalies: [],
            alerts: [],
            deployments: [],
          });
        });

        await apiTest.step('downstream dependencies', async () => {
          const downstreamDependencies = getDownstreamDependencies(alertContext);
          expect(downstreamDependencies).toHaveLength(1);
          const dep = downstreamDependencies![0];
          expect(dep['span.destination.service.resource']).toBe('elasticsearch');
          expect(dep['span.type']).toBe('db');
          expect(dep['span.subtype']).toBe('elasticsearch');
          expect(dep.errorRate).toBe(0);
          expect(dep.latencyMs).toBe(1000000);
          // throughputPerMin varies slightly based on timing, so only assert it is positive.
          expect(dep.throughputPerMin as number).toBeGreaterThan(0);
        });

        await apiTest.step('log categories', async () => {
          const logCategories = getLogCategories(alertContext);
          expect(logCategories).toHaveLength(1);
          const [logCategory] = logCategories;
          expect(getSampleMessage(logCategory)).toMatch(
            /Error message #\d{16} from container my-container-a/
          );
          expect(logCategory.docCount).toBeGreaterThan(0);
          expect(logCategory.errorCategory).toBe('Error message from container my-container-a');
        });
      }
    );

    apiTest(
      'returns service summary, downstream dependencies and log categories when container.id is specified',
      async ({ apiClient }) => {
        const alertContext = await fetchContext(apiClient, { 'container.id': 'my-container-a' });

        await apiTest.step('service summary', async () => {
          expect(getServiceSummary(alertContext)?.data).toStrictEqual({
            'service.name': 'Backend',
            'service.environment': ['production'],
            'agent.name': 'java',
            'service.version': ['1.0.0'],
            'language.name': 'java',
            instances: 1,
            anomalies: [],
            alerts: [],
            deployments: [],
          });
        });

        await apiTest.step('downstream dependencies', async () => {
          const downstreamDependencies = getDownstreamDependencies(alertContext);
          expect(downstreamDependencies).toHaveLength(1);
          const dep = downstreamDependencies![0];
          expect(dep['span.destination.service.resource']).toBe('elasticsearch');
          expect(dep['span.type']).toBe('db');
          expect(dep['span.subtype']).toBe('elasticsearch');
          expect(dep.errorRate).toBe(0);
          expect(dep.latencyMs).toBe(1000000);
          expect(dep.throughputPerMin as number).toBeGreaterThan(0);
        });

        await apiTest.step('log categories', async () => {
          const logCategories = getLogCategories(alertContext);
          expect(logCategories).toHaveLength(1);
          const [logCategory] = logCategories;
          expect(getSampleMessage(logCategory)).toMatch(
            /Error message #\d{16} from container my-container-a/
          );
          expect(logCategory.docCount).toBeGreaterThan(0);
          expect(logCategory.errorCategory).toBe('Error message from container my-container-a');
        });
      }
    );

    apiTest('returns nothing for a non-existing container id', async ({ apiClient }) => {
      const alertContext = await fetchContext(apiClient, {
        'container.id': 'non-existing-container',
      });
      expect(alertContext).toStrictEqual([]);
    });

    apiTest(
      'returns an empty service summary and log categories for a non-existing service.name',
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

        expect(getDownstreamDependencies(alertContext)).toBeUndefined();
        expect(getLogCategories(alertContext)).toHaveLength(1);
      }
    );
  }
);
