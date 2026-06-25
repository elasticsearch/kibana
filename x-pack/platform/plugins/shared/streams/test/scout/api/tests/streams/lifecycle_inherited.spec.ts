/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import { tags } from '@kbn/scout';
import { streamsApiTest as apiTest } from '../../fixtures';
import { COMMON_API_HEADERS, PUBLIC_API_HEADERS } from '../../fixtures/constants';

apiTest.describe(
  'Stream lifecycle - inherited config API',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    const rootStream = 'logs.otel';
    const streamNamePrefix = `${rootStream}.lci`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type ApiClient = any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type CookieHeader = any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type StreamResponse = any;

    async function forkStream(
      apiClient: ApiClient,
      cookieHeader: CookieHeader,
      parent: string,
      child: string,
      where: { field: string; eq: string }
    ): Promise<void> {
      const forkResponse = await apiClient.post(`api/streams/${parent}/_fork`, {
        headers: { ...PUBLIC_API_HEADERS, ...cookieHeader },
        body: { stream: { name: child }, where, status: 'enabled' },
        responseType: 'json',
      });
      expect(forkResponse).toHaveStatusCode(200);
    }

    async function getStream(
      apiClient: ApiClient,
      cookieHeader: CookieHeader,
      streamName: string
    ): Promise<StreamResponse> {
      const response = await apiClient.get(`api/streams/${streamName}`, {
        headers: { ...PUBLIC_API_HEADERS, ...cookieHeader },
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(200);
      return response.body;
    }

    function getWriteableIngest(streamResponse: StreamResponse): StreamResponse {
      const ingest = streamResponse.stream.ingest;
      const { updated_at: _, ...processingWithoutUpdatedAt } = ingest.processing || {};
      return { ...ingest, processing: processingWithoutUpdatedAt };
    }

    async function setParentDslRetention(
      apiClient: ApiClient,
      cookieHeader: CookieHeader,
      streamName: string,
      dataRetention: string
    ): Promise<void> {
      const stream = await getStream(apiClient, cookieHeader, streamName);
      const updateResponse = await apiClient.put(`api/streams/${streamName}/_ingest`, {
        headers: { ...PUBLIC_API_HEADERS, ...cookieHeader },
        body: {
          ingest: {
            ...getWriteableIngest(stream),
            lifecycle: { dsl: { data_retention: dataRetention } },
          },
        },
        responseType: 'json',
      });
      expect(updateResponse).toHaveStatusCode(200);
    }

    apiTest.afterEach(async ({ apiServices }) => {
      await apiServices.streamsTest.cleanupTestStreams(streamNamePrefix);
    });

    apiTest(
      'returns the lifecycle inherited from the parent wired stream',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asStreamsAdmin();
        const parentStream = `${streamNamePrefix}-parent`;
        const childStream = `${parentStream}.child`;

        await forkStream(apiClient, cookieHeader, rootStream, parentStream, {
          field: 'service.name',
          eq: 'inherited-parent',
        });
        await setParentDslRetention(apiClient, cookieHeader, parentStream, '45d');

        await forkStream(apiClient, cookieHeader, parentStream, childStream, {
          field: 'log.level',
          eq: 'error',
        });

        const { statusCode, body } = await apiClient.get(
          `internal/streams/${childStream}/lifecycle/_inherited`,
          {
            headers: { ...COMMON_API_HEADERS, ...cookieHeader },
            responseType: 'json',
          }
        );

        expect(statusCode).toBe(200);
        expect(body.lifecycle).toBeDefined();
        // The child would inherit the parent's DSL retention of 45d.
        expect(body.lifecycle.dsl).toBeDefined();
        expect(body.lifecycle.dsl.data_retention).toBe('45d');
      }
    );

    apiTest(
      'reflects the parent retention even when the child has its own override',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asStreamsAdmin();
        const parentStream = `${streamNamePrefix}-override-parent`;
        const childStream = `${parentStream}.child`;

        await forkStream(apiClient, cookieHeader, rootStream, parentStream, {
          field: 'service.name',
          eq: 'override-parent',
        });
        await setParentDslRetention(apiClient, cookieHeader, parentStream, '15d');

        await forkStream(apiClient, cookieHeader, parentStream, childStream, {
          field: 'log.level',
          eq: 'warn',
        });
        // Give the child its own retention; the _inherited endpoint must ignore it.
        await setParentDslRetention(apiClient, cookieHeader, childStream, '90d');

        const { statusCode, body } = await apiClient.get(
          `internal/streams/${childStream}/lifecycle/_inherited`,
          {
            headers: { ...COMMON_API_HEADERS, ...cookieHeader },
            responseType: 'json',
          }
        );

        expect(statusCode).toBe(200);
        expect(body.lifecycle.dsl).toBeDefined();
        // Inherited config comes from the parent (15d), not the child's own 90d override.
        expect(body.lifecycle.dsl.data_retention).toBe('15d');
      }
    );

    apiTest(
      'returns 404 for a non-existent stream lifecycle inheritance',
      async ({ apiClient, samlAuth }) => {
        const { cookieHeader } = await samlAuth.asStreamsAdmin();

        const { statusCode } = await apiClient.get(
          'internal/streams/non-existent-inherited-stream/lifecycle/_inherited',
          {
            headers: { ...COMMON_API_HEADERS, ...cookieHeader },
            responseType: 'json',
          }
        );

        expect([403, 404]).toContain(statusCode);
      }
    );
  }
);
