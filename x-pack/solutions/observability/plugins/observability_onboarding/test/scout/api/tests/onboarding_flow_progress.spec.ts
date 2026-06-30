/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { log, timerange } from '@kbn/synthtrace-client';
import { expect } from '@kbn/scout-oblt/api';
import { tags } from '@kbn/scout-oblt';
import type { KibanaRole } from '@kbn/scout-oblt';
import { ONBOARDING_COMMON_HEADERS } from '../fixtures/constants';
import { apiTest } from '../fixtures';

const NO_ACCESS_USER_ROLE: KibanaRole = {
  elasticsearch: {
    cluster: [],
    indices: [],
  },
  kibana: [],
};

// Failing: See https://github.com/elastic/kibana/issues/265767
apiTest.describe.skip(
  'Observability onboarding GET flow progress',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    const datasetName = 'api-tests';
    const namespace = 'default';
    const agentId = 'my-agent-id';

    /** Cookie session: create flow runs `authc.apiKeys.create`, which fails for API-key-authenticated requests. */
    let adminInteractiveHeaders: Record<string, string>;
    let onboardingId: string;

    apiTest.beforeAll(async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
      adminInteractiveHeaders = {
        ...ONBOARDING_COMMON_HEADERS,
        ...cookieHeader,
      };
      const createFlowResponse = await apiClient.post('internal/observability_onboarding/flow', {
        headers: adminInteractiveHeaders,
        responseType: 'json',
      });
      expect(createFlowResponse).toHaveStatusCode(200);
      onboardingId = (createFlowResponse.body as { onboardingFlow: { id: string } }).onboardingFlow
        .id;
    });

    apiTest('returns 404 when onboardingId does not exist', async ({ apiClient }) => {
      const response = await apiClient.get(
        'internal/observability_onboarding/flow/test-onboarding-id/progress',
        {
          headers: adminInteractiveHeaders,
          responseType: 'json',
        }
      );
      expect(response).toHaveStatusCode(404);
      expect((response.body as { message?: string }).message).toContain(
        'onboarding session not found'
      );
    });

    apiTest(
      'returns 404 for user without access to the onboarding session',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asInteractiveUser(NO_ACCESS_USER_ROLE);
        const response = await apiClient.get(
          `internal/observability_onboarding/flow/${onboardingId}/progress`,
          {
            headers: {
              ...ONBOARDING_COMMON_HEADERS,
              ...cookieHeader,
            },
            responseType: 'json',
          }
        );
        expect(response).toHaveStatusCode(404);
        expect((response.body as { message?: string }).message).toContain(
          'onboarding session not found'
        );
      }
    );

    apiTest(
      'logs-ingest progress after ea-status complete',
      async ({ apiClient, logsSynthtraceEsClient }) => {
        await apiTest.step('post ea-status complete', async () => {
          const stepResponse = await apiClient.post(
            `internal/observability_onboarding/flow/${onboardingId}/step/ea-status`,
            {
              headers: adminInteractiveHeaders,
              responseType: 'json',
              body: {
                status: 'complete',
                payload: {
                  agentId,
                },
              },
            }
          );
          expect(stepResponse).toHaveStatusCode(200);
        });

        await apiTest.step('log-ingest is loading when no logs ingested', async () => {
          const response = await apiClient.get(
            `internal/observability_onboarding/flow/${onboardingId}/progress`,
            {
              headers: adminInteractiveHeaders,
              responseType: 'json',
            }
          );
          expect(response).toHaveStatusCode(200);
          const progress = (response.body as { progress: Record<string, { status: string }> })
            .progress;
          expect(progress['logs-ingest']).toMatchObject({ status: 'loading' });
        });

        await apiTest.step(
          'log-ingest stays loading when logs use a different agent id',
          async () => {
            await logsSynthtraceEsClient.index(
              timerange('2023-11-20T10:00:00.000Z', '2023-11-20T10:01:00.000Z')
                .interval('1m')
                .rate(1)
                .generator((timestamp) =>
                  log
                    .create()
                    .message('This is a log message')
                    .timestamp(timestamp)
                    .dataset(datasetName)
                    .namespace(namespace)
                    .service('my-service')
                    .defaults({
                      'agent.id': 'another-agent-id',
                      'log.file.path': '/my-service.log',
                    })
                )
            );

            const response = await apiClient.get(
              `internal/observability_onboarding/flow/${onboardingId}/progress`,
              {
                headers: adminInteractiveHeaders,
                responseType: 'json',
              }
            );
            expect(response).toHaveStatusCode(200);
            const progress = (response.body as { progress: Record<string, { status: string }> })
              .progress;
            expect(progress['logs-ingest']).toMatchObject({ status: 'loading' });

            await logsSynthtraceEsClient.clean();
          }
        );

        await apiTest.step('log-ingest is complete when logs match expected agent id', async () => {
          await logsSynthtraceEsClient.index(
            timerange('2023-11-20T10:00:00.000Z', '2023-11-20T10:01:00.000Z')
              .interval('1m')
              .rate(1)
              .generator((timestamp) =>
                log
                  .create()
                  .message('This is a log message')
                  .timestamp(timestamp)
                  .dataset(datasetName)
                  .namespace(namespace)
                  .service('my-service')
                  .defaults({
                    'agent.id': agentId,
                    'log.file.path': '/my-service.log',
                  })
              )
          );

          const response = await apiClient.get(
            `internal/observability_onboarding/flow/${onboardingId}/progress`,
            {
              headers: adminInteractiveHeaders,
              responseType: 'json',
            }
          );
          expect(response).toHaveStatusCode(200);
          const progress = (response.body as { progress: Record<string, { status: string }> })
            .progress;
          expect(progress['logs-ingest']).toMatchObject({ status: 'complete' });

          await logsSynthtraceEsClient.clean();
        });
      }
    );
  }
);
