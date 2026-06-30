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

apiTest.describe('Stream lifecycle & failure store - inherited config API', () => {
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
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
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
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
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
    'returns the failure store inherited from the parent wired stream',
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asStreamsAdmin();
      const parentStream = `${streamNamePrefix}-fs-parent`;
      const childStream = `${parentStream}.child`;

      await forkStream(apiClient, cookieHeader, rootStream, parentStream, {
        field: 'service.name',
        eq: 'fs-parent',
      });

      // Enable failure store with a custom retention on the parent.
      const parent = await getStream(apiClient, cookieHeader, parentStream);
      const updateParentResponse = await apiClient.put(`api/streams/${parentStream}/_ingest`, {
        headers: { ...PUBLIC_API_HEADERS, ...cookieHeader },
        body: {
          ingest: {
            ...getWriteableIngest(parent),
            failure_store: { lifecycle: { enabled: { data_retention: '20d' } } },
          },
        },
        responseType: 'json',
      });
      expect(updateParentResponse).toHaveStatusCode(200);

      await forkStream(apiClient, cookieHeader, parentStream, childStream, {
        field: 'log.level',
        eq: 'error',
      });

      const { statusCode, body } = await apiClient.get(
        `internal/streams/${childStream}/failure_store/_inherited`,
        {
          headers: { ...COMMON_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        }
      );

      expect(statusCode).toBe(200);
      expect(body.failure_store).toBeDefined();
      expect(body.failure_store.lifecycle).toBeDefined();
      expect(body.failure_store.lifecycle.enabled).toBeDefined();
      expect(body.failure_store.lifecycle.enabled.data_retention).toBe('20d');
    }
  );

  apiTest(
    'returns an inherited failure store result for a stream without explicit failure store config',
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asStreamsAdmin();
      const parentStream = `${streamNamePrefix}-fs-default-parent`;
      const childStream = `${parentStream}.child`;

      await forkStream(apiClient, cookieHeader, rootStream, parentStream, {
        field: 'service.name',
        eq: 'fs-default-parent',
      });
      await forkStream(apiClient, cookieHeader, parentStream, childStream, {
        field: 'log.level',
        eq: 'info',
      });

      const { statusCode, body } = await apiClient.get(
        `internal/streams/${childStream}/failure_store/_inherited`,
        {
          headers: { ...COMMON_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        }
      );

      expect(statusCode).toBe(200);
      // The shape is always an EffectiveFailureStore object: either disabled or a lifecycle config.
      expect(body.failure_store).toBeDefined();
      expect('disabled' in body.failure_store || 'lifecycle' in body.failure_store).toBe(true);
    }
  );

  apiTest(
    'returns the ILM policy a classic stream would inherit from its index template',
    // ILM is a stateful-only concept, so this case does not apply to serverless.
    { tag: tags.stateful.classic },
    async ({ apiClient, samlAuth, esClient }) => {
      const { cookieHeader } = await samlAuth.asStreamsAdmin();

      const dataStreamName = 'logs-lci-ilm-classic';
      const templateName = 'lci-ilm-classic-template';
      const policyName = 'lci-ilm-classic-policy';

      try {
        await esClient.ilm.putLifecycle({
          name: policyName,
          policy: {
            phases: {
              hot: { actions: { rollover: { max_age: '30d' } } },
              delete: { min_age: '90d', actions: { delete: {} } },
            },
          },
        });

        await esClient.indices.putIndexTemplate({
          name: templateName,
          index_patterns: [`${dataStreamName}*`],
          data_stream: {},
          priority: 500,
          template: {
            settings: {
              'index.lifecycle.name': policyName,
              'index.lifecycle.prefer_ilm': true,
            },
          },
        });

        await esClient.indices.createDataStream({ name: dataStreamName });

        const { statusCode, body } = await apiClient.get(
          `internal/streams/${dataStreamName}/lifecycle/_inherited`,
          {
            headers: { ...COMMON_API_HEADERS, ...cookieHeader },
            responseType: 'json',
          }
        );

        expect(statusCode).toBe(200);
        expect(body.lifecycle.ilm).toBeDefined();
        expect(body.lifecycle.ilm.policy).toBe(policyName);
        expect(body.lifecycle.dsl).toBeUndefined();
      } finally {
        await esClient.indices.deleteDataStream({ name: dataStreamName }).catch(() => {});
        await esClient.indices.deleteIndexTemplate({ name: templateName }).catch(() => {});
        await esClient.ilm.deleteLifecycle({ name: policyName }).catch(() => {});
      }
    }
  );

  apiTest(
    'returns the failure store a classic stream would inherit from an exact-pattern index template',
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
    async ({ apiClient, samlAuth, esClient }) => {
      const { cookieHeader } = await samlAuth.asStreamsAdmin();

      const dataStreamName = 'logs-lci-fs-exact';
      const templateName = 'lci-fs-exact-template';

      try {
        await esClient.indices.putIndexTemplate({
          name: templateName,
          index_patterns: [dataStreamName],
          data_stream: {},
          priority: 500,
          template: {
            data_stream_options: {
              failure_store: {
                enabled: true,
                lifecycle: { data_retention: '45d' },
              },
            },
          },
        });

        await esClient.indices.createDataStream({ name: dataStreamName });

        const { statusCode, body } = await apiClient.get(
          `internal/streams/${dataStreamName}/failure_store/_inherited`,
          {
            headers: { ...COMMON_API_HEADERS, ...cookieHeader },
            responseType: 'json',
          }
        );

        expect(statusCode).toBe(200);
        expect(body.failure_store).toBeDefined();
        expect(body.failure_store.lifecycle).toBeDefined();
        expect(body.failure_store.lifecycle.enabled).toBeDefined();
        expect(body.failure_store.lifecycle.enabled.data_retention).toBe('45d');
      } finally {
        await esClient.indices.deleteDataStream({ name: dataStreamName }).catch(() => {});
        await esClient.indices.deleteIndexTemplate({ name: templateName }).catch(() => {});
      }
    }
  );

  apiTest(
    'returns 404 for a non-existent stream lifecycle inheritance',
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
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

  apiTest(
    'returns 404 for a non-existent stream failure store inheritance',
    { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asStreamsAdmin();

      const { statusCode } = await apiClient.get(
        'internal/streams/non-existent-inherited-stream/failure_store/_inherited',
        {
          headers: { ...COMMON_API_HEADERS, ...cookieHeader },
          responseType: 'json',
        }
      );

      expect([403, 404]).toContain(statusCode);
    }
  );
});
