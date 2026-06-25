/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/api';
import type { EsClient } from '@kbn/scout-security';
import { get } from 'lodash';
import {
  PUBLIC_HEADERS,
  INTERNAL_HEADERS,
  ENTITY_STORE_ROUTES,
  ENTITY_STORE_TAGS,
  LATEST_ALIAS,
  UPDATES_INDEX,
} from '../fixtures/constants';
import { FF_ENABLE_ENTITY_STORE_V2 } from '../../../../common';
import { clearEntityStoreIndices } from '../fixtures/helpers';

const DOCS_LIMIT = 2;
const CCS_TEST_LOGS_INDEX = 'ccs-test-logs';
const FROM_DATE = '2026-02-25T10:00:00Z';
const TO_DATE = '2026-02-25T12:00:00Z';
// CCS writes entities with @timestamp = now + Nms; use a future date so local extraction picks them up
const MAX_DATE_OF_UPDATES = new Date(Date.now() + 5 * 60_000).toISOString();

async function createCcsTestLogsIndex(esClient: EsClient) {
  await esClient.indices.delete({ index: CCS_TEST_LOGS_INDEX }, { ignore: [404] });
  await esClient.indices.create({
    index: CCS_TEST_LOGS_INDEX,
    mappings: {
      properties: {
        '@timestamp': { type: 'date' },
        host: {
          properties: {
            entity: {
              properties: {
                id: { type: 'keyword' },
                sub_type: { type: 'keyword' },
              },
            },
            id: { type: 'keyword' },
            name: { type: 'keyword' },
            domain: { type: 'keyword' },
            hostname: { type: 'keyword' },
            architecture: { type: 'keyword' },
          },
        },
        user: {
          properties: {
            name: { type: 'keyword' },
            id: { type: 'keyword' },
            email: { type: 'keyword' },
          },
        },
        event: {
          properties: {
            kind: { type: 'keyword' },
            category: { type: 'keyword' },
            type: { type: 'keyword' },
            module: { type: 'keyword' },
          },
        },
        data_stream: {
          properties: {
            dataset: { type: 'keyword' },
          },
        },
        service: {
          properties: {
            name: { type: 'keyword' },
            version: { type: 'keyword' },
          },
        },
        entity: {
          properties: {
            id: { type: 'keyword' },
            name: { type: 'keyword' },
          },
        },
      },
    },
  });
}

async function ingestDoc(
  esClient: EsClient,
  index: string,
  doc: Record<string, unknown> & { '@timestamp': string }
) {
  await esClient.index({
    index,
    refresh: 'wait_for',
    body: doc,
  });
}

apiTest.describe(
  'Entity Store CCS logs extraction (test against local instance)',
  { tag: ENTITY_STORE_TAGS },
  () => {
    let defaultHeaders: Record<string, string>;
    let internalHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ samlAuth, apiClient, kbnClient }) => {
      const credentials = await samlAuth.asInteractiveUser('admin');
      defaultHeaders = {
        ...credentials.cookieHeader,
        ...PUBLIC_HEADERS,
      };
      internalHeaders = {
        ...credentials.cookieHeader,
        ...INTERNAL_HEADERS,
      };

      await kbnClient.uiSettings.update({
        [FF_ENABLE_ENTITY_STORE_V2]: true,
      });

      await apiClient.post(ENTITY_STORE_ROUTES.public.INSTALL, {
        headers: defaultHeaders,
        responseType: 'json',
        body: {
          logExtraction: {
            docsLimit: DOCS_LIMIT,
          },
        },
      });
    });

    apiTest.afterAll(async ({ apiClient, esClient }) => {
      await esClient.indices.delete({ index: CCS_TEST_LOGS_INDEX }, { ignore: [404] });

      await apiClient.post(ENTITY_STORE_ROUTES.public.UNINSTALL, {
        headers: defaultHeaders,
        responseType: 'json',
        body: {},
      });
      await clearEntityStoreIndices(esClient);
    });

    apiTest(
      'Should run CCS extraction for host and write to updates then latest index',
      async ({ apiClient, esClient }) => {
        await createCcsTestLogsIndex(esClient);

        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:00:01Z',
          host: { name: 'name-a1', architecture: 'x86_64', entity: { sub_type: 'bare-metal' } },
        });
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:05:00Z',
          host: { name: 'name-a1', architecture: 'aarch64', entity: { sub_type: 'vm' } },
        });
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:10:00Z',
          host: { name: 'name-a1', architecture: 'arm64', entity: { sub_type: 'container' } },
        });
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:15:00Z',
          host: { id: 'host-id-b', name: 'server-b' },
        });
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:20:00Z',
          host: { hostname: 'server-c' },
        });
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:25:00Z',
          host: { name: 'server-d', domain: 'example.com', hostname: 'server-d-hostname' },
        });

        const extractResponse = await apiClient.post(
          ENTITY_STORE_ROUTES.internal.FORCE_REMOTE_EXTRACT_TO_UPDATES('host'),
          {
            headers: internalHeaders,
            responseType: 'json',
            body: {
              indexPatterns: [CCS_TEST_LOGS_INDEX],
              fromDateISO: FROM_DATE,
              toDateISO: TO_DATE,
              docsLimit: DOCS_LIMIT,
            },
          }
        );
        expect(extractResponse.statusCode).toBe(200);
        expect(extractResponse.body).toMatchObject({ count: 4, pages: 2 });
        await esClient.indices.refresh({ index: UPDATES_INDEX });

        const logExtractionResponse = await apiClient.post(
          ENTITY_STORE_ROUTES.internal.FORCE_LOG_EXTRACTION('host'),
          {
            headers: internalHeaders,
            responseType: 'json',
            body: {
              fromDateISO: TO_DATE,
              toDateISO: MAX_DATE_OF_UPDATES,
            },
          }
        );
        expect(logExtractionResponse.statusCode).toBe(200);
        expect(logExtractionResponse.body.success).toBe(true);

        await esClient.indices.refresh({ index: LATEST_ALIAS });

        const latestSearchResponse = await esClient.search({
          index: LATEST_ALIAS,
          size: 100,
          query: {
            bool: {
              filter: [
                { term: { 'entity.EngineMetadata.Type': 'host' } },
                {
                  terms: {
                    'entity.id': [
                      'host:name-a1',
                      'host:host-id-b',
                      'host:server-c',
                      'host:server-d',
                    ],
                  },
                },
              ],
            },
          },
        });

        const latestHits = latestSearchResponse.hits.hits as Array<{
          _source: Record<string, unknown>;
        }>;
        expect(latestHits).toHaveLength(4);

        const byId = Object.fromEntries(
          latestHits.map((h) => [get(h._source, ['entity', 'id']), h._source])
        );

        const entityA = byId['host:name-a1'] as Record<string, unknown>;
        expect(entityA).toBeDefined();
        expect(get(entityA, ['entity', 'name'])).toBe('name-a1');
        expect(get(entityA, ['entity', 'sub_type'])).toBe('container');

        const hostArchitectureA = get(entityA, ['host', 'architecture']);
        expect(Array.isArray(hostArchitectureA)).toBe(true);
        expect((hostArchitectureA as string[]).sort()).toStrictEqual([
          'aarch64',
          'arm64',
          'x86_64',
        ]);

        const entityB = byId['host:host-id-b'] as Record<string, unknown>;
        expect(entityB).toBeDefined();
        expect(get(entityB, ['entity', 'name'])).toBe('server-b');

        const entityC = byId['host:server-c'] as Record<string, unknown>;
        expect(entityC).toBeDefined();

        const entityD = byId['host:server-d'] as Record<string, unknown>;
        expect(entityD).toBeDefined();
      }
    );

    apiTest(
      'Should run CCS extraction for user and write to updates then latest index',
      async ({ apiClient, esClient }) => {
        await createCcsTestLogsIndex(esClient);

        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:30:00Z',
          user: { name: 'alice', domain: 'elastic.co' },
          event: { kind: 'asset', module: 'entityanalytics_ad' },
        });
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:35:00Z',
          user: { email: 'bob@email.com', id: 'u2', name: 'bob' },
          event: { kind: 'asset', module: 'aws' },
        });

        // Shared module user
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:35:01Z',
          user: { name: 'romulo.farias' },
          event: { kind: 'asset', module: 'okta' },
        });

        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:35:01Z',
          user: { name: 'romulo.farias' },
          event: { kind: 'asset', module: 'entityanalytics_okta' },
        });

        // User with two different data_stream.dataset values (no event.module); both resolve to okta
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:35:02Z',
          user: { name: 'cecilia' },
          event: { kind: 'asset' },
          data_stream: { dataset: 'entityanalytics_okta.users' },
        });
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:35:03Z',
          user: { name: 'cecilia' },
          event: { kind: 'asset' },
          data_stream: { dataset: 'okta.logs' },
        });

        // User with empty event.module and data_stream.dataset → namespace fallback 'unknown'
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:35:04Z',
          user: { name: 'flora' },
          event: { kind: 'asset', module: '' },
          data_stream: { dataset: '' },
        });

        const extractResponse = await apiClient.post(
          ENTITY_STORE_ROUTES.internal.FORCE_REMOTE_EXTRACT_TO_UPDATES('user'),
          {
            headers: internalHeaders,
            responseType: 'json',
            body: {
              indexPatterns: [CCS_TEST_LOGS_INDEX],
              fromDateISO: FROM_DATE,
              toDateISO: TO_DATE,
              docsLimit: DOCS_LIMIT,
            },
          }
        );
        expect(extractResponse.statusCode).toBe(200);
        expect(extractResponse.body).toMatchObject({ count: 5, pages: 3 });
        await esClient.indices.refresh({ index: UPDATES_INDEX });

        const logExtractionResponse = await apiClient.post(
          ENTITY_STORE_ROUTES.internal.FORCE_LOG_EXTRACTION('user'),
          {
            headers: internalHeaders,
            responseType: 'json',
            body: {
              fromDateISO: TO_DATE,
              toDateISO: MAX_DATE_OF_UPDATES,
            },
          }
        );
        expect(logExtractionResponse.statusCode).toBe(200);
        expect(logExtractionResponse.body.success).toBe(true);

        await esClient.indices.refresh({ index: LATEST_ALIAS });

        const latestSearchResponse = await esClient.search({
          index: LATEST_ALIAS,
          size: 100,
          query: {
            bool: {
              filter: [
                { term: { 'entity.EngineMetadata.Type': 'user' } },
                {
                  terms: {
                    'entity.id': [
                      'user:alice@elastic.co@active_directory',
                      'user:bob@email.com@aws',
                      'user:romulo.farias@okta',
                      'user:cecilia@okta',
                      'user:flora@unknown',
                    ],
                  },
                },
              ],
            },
          },
        });

        const byId = Object.fromEntries(
          latestSearchResponse.hits.hits.map((h) => [get(h._source, ['entity', 'id']), h._source])
        );

        const entityA = byId['user:alice@elastic.co@active_directory'];
        expect(entityA).toBeDefined();
        expect(get(entityA, ['entity', 'name'])).toBe('alice');
        expect(get(entityA, ['entity', 'namespace'])).toBe('active_directory');
        expect(get(entityA, ['user', 'domain'])).toBe('elastic.co');
        expect(get(entityA, ['event', 'kind'])).toBe('asset');

        const entityB = byId['user:bob@email.com@aws'];
        expect(entityB).toBeDefined();
        expect(get(entityB, ['entity', 'name'])).toBe('bob');
        expect(get(entityB, ['entity', 'namespace'])).toBe('aws');
        expect(get(entityB, ['user', 'email'])).toBe('bob@email.com');
        expect(get(entityB, ['event', 'kind'])).toBe('asset');

        const entityC = byId['user:romulo.farias@okta'];
        expect(entityC).toBeDefined();
        expect(get(entityC, ['entity', 'name'])).toBe('romulo.farias');
        expect(get(entityC, ['entity', 'namespace'])).toBe('okta');
        expect((get(entityC, ['event', 'module']) as string[]).sort()).toStrictEqual(
          ['entityanalytics_okta', 'okta'].sort()
        );
        expect(get(entityC, ['event', 'kind'])).toBe('asset');

        const entityD = byId['user:cecilia@okta'];
        expect(entityD).toBeDefined();
        expect(get(entityD, ['entity', 'name'])).toBe('cecilia');
        expect(get(entityD, ['entity', 'namespace'])).toBe('okta');
        expect(get(entityD, ['event', 'kind'])).toBe('asset');
        expect((get(entityD, ['data_stream', 'dataset']) as string[]).sort()).toStrictEqual(
          ['entityanalytics_okta.users', 'okta.logs'].sort()
        );

        const entityE = byId['user:flora@unknown'];
        expect(entityE).toBeDefined();
        expect(get(entityE, ['entity', 'name'])).toBe('flora');
        expect(get(entityE, ['entity', 'namespace'])).toBe('unknown');
        expect(get(entityE, ['event', 'kind'])).toBe('asset');
      }
    );

    apiTest(
      'Should run CCS extraction for service and write to updates then latest index',
      async ({ apiClient, esClient }) => {
        await createCcsTestLogsIndex(esClient);

        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:40:00Z',
          service: { name: 'svc-a', version: '1.0' },
        });
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:45:00Z',
          service: { name: 'svc-b' },
        });

        const extractResponse = await apiClient.post(
          ENTITY_STORE_ROUTES.internal.FORCE_REMOTE_EXTRACT_TO_UPDATES('service'),
          {
            headers: internalHeaders,
            responseType: 'json',
            body: {
              indexPatterns: [CCS_TEST_LOGS_INDEX],
              fromDateISO: FROM_DATE,
              toDateISO: TO_DATE,
              docsLimit: DOCS_LIMIT,
            },
          }
        );
        expect(extractResponse.statusCode).toBe(200);
        expect(extractResponse.body).toMatchObject({ count: 2, pages: 1 });
        await esClient.indices.refresh({ index: UPDATES_INDEX });

        const logExtractionResponse = await apiClient.post(
          ENTITY_STORE_ROUTES.internal.FORCE_LOG_EXTRACTION('service'),
          {
            headers: internalHeaders,
            responseType: 'json',
            body: {
              fromDateISO: TO_DATE,
              toDateISO: MAX_DATE_OF_UPDATES,
            },
          }
        );
        expect(logExtractionResponse.statusCode).toBe(200);
        expect(logExtractionResponse.body.success).toBe(true);

        await esClient.indices.refresh({ index: LATEST_ALIAS });

        const latestSearchResponse = await esClient.search({
          index: LATEST_ALIAS,
          size: 100,
          query: {
            bool: {
              filter: [
                { term: { 'entity.EngineMetadata.Type': 'service' } },
                {
                  terms: {
                    'entity.id': ['service:svc-a', 'service:svc-b'],
                  },
                },
              ],
            },
          },
          sort: 'entity.id:asc',
        });

        expect(latestSearchResponse.hits.hits).toHaveLength(2);
        const hits = latestSearchResponse.hits.hits;
        expect(get(hits[0], ['_source', 'entity', 'id'])).toBe('service:svc-a');
        expect(get(hits[0], ['_source', 'service', 'name'])).toBe('svc-a');
        expect(get(hits[0], ['_source', 'service', 'version'])).toBe('1.0');

        expect(get(hits[1], ['_source', 'entity', 'id'])).toBe('service:svc-b');
        expect(get(hits[1], ['_source', 'service', 'name'])).toBe('svc-b');
      }
    );

    apiTest(
      'Should run CCS extraction for generic and write to updates then latest index',
      async ({ apiClient, esClient }) => {
        await createCcsTestLogsIndex(esClient);

        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:50:00Z',
          entity: { id: 'gen-1', name: 'Generic One' },
        });
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:55:00Z',
          entity: { id: 'gen-2', name: 'Generic Two' },
        });

        const extractResponse = await apiClient.post(
          ENTITY_STORE_ROUTES.internal.FORCE_REMOTE_EXTRACT_TO_UPDATES('generic'),
          {
            headers: internalHeaders,
            responseType: 'json',
            body: {
              indexPatterns: [CCS_TEST_LOGS_INDEX],
              fromDateISO: FROM_DATE,
              toDateISO: TO_DATE,
              docsLimit: DOCS_LIMIT,
            },
          }
        );
        expect(extractResponse.statusCode).toBe(200);
        expect(extractResponse.body).toMatchObject({ count: 2, pages: 1 });
        await esClient.indices.refresh({ index: UPDATES_INDEX });

        const logExtractionResponse = await apiClient.post(
          ENTITY_STORE_ROUTES.internal.FORCE_LOG_EXTRACTION('generic'),
          {
            headers: internalHeaders,
            responseType: 'json',
            body: {
              fromDateISO: TO_DATE,
              toDateISO: MAX_DATE_OF_UPDATES,
            },
          }
        );
        expect(logExtractionResponse.statusCode).toBe(200);
        expect(logExtractionResponse.body.success).toBe(true);

        await esClient.indices.refresh({ index: LATEST_ALIAS });

        const latestSearchResponse = await esClient.search({
          index: LATEST_ALIAS,
          size: 100,
          query: {
            bool: {
              filter: [
                { term: { 'entity.EngineMetadata.Type': 'generic' } },
                {
                  terms: {
                    'entity.id': ['gen-1', 'gen-2'],
                  },
                },
              ],
            },
          },
          sort: 'entity.id:asc',
        });

        expect(latestSearchResponse.hits.hits).toHaveLength(2);
        const hits = latestSearchResponse.hits.hits;
        expect(get(hits[0], ['_source', 'entity', 'id'])).toBe('gen-1');
        expect(get(hits[0], ['_source', 'entity', 'name'])).toBe('Generic One');

        expect(get(hits[1], ['_source', 'entity', 'id'])).toBe('gen-2');
        expect(get(hits[1], ['_source', 'entity', 'name'])).toBe('Generic Two');
      }
    );

    apiTest(
      'Should paginate correctly across outer log-slice loop and inner entity-page loop',
      async ({ apiClient, esClient }) => {
        await createCcsTestLogsIndex(esClient);

        // 6 distinct hosts: one doc each. With maxLogsPerPage=3 and docsLimit=2:
        // - Outer loop: 3 slices (T0-T2 / T2-T4 / T4-T5); inclusive lower bound means the
        //   slice-end doc is re-processed in the next slice (idempotent aggregations, safe).
        // - Inner loop: 2+2+1=5 pages (docsLimit=2)
        // - count=8 because boundary docs host-3 (T2) and host-5 (T4) each appear in two slices
        // - 6 unique entities end up in the store (upserts are idempotent)
        // Total: count=8, pages=5
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:00:00Z',
          host: { name: 'pagination-host-1' },
        });
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:01:00Z',
          host: { name: 'pagination-host-2' },
        });
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:02:00Z',
          host: { name: 'pagination-host-3' },
        });
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:03:00Z',
          host: { name: 'pagination-host-4' },
        });
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:04:00Z',
          host: { name: 'pagination-host-5' },
        });
        await ingestDoc(esClient, CCS_TEST_LOGS_INDEX, {
          '@timestamp': '2026-02-25T10:05:00Z',
          host: { name: 'pagination-host-6' },
        });

        const extractResponse = await apiClient.post(
          ENTITY_STORE_ROUTES.internal.FORCE_REMOTE_EXTRACT_TO_UPDATES('host'),
          {
            headers: internalHeaders,
            responseType: 'json',
            body: {
              indexPatterns: [CCS_TEST_LOGS_INDEX],
              fromDateISO: FROM_DATE,
              toDateISO: TO_DATE,
              docsLimit: DOCS_LIMIT,
              maxLogsPerPage: 3,
            },
          }
        );
        expect(extractResponse.statusCode).toBe(200);
        expect(extractResponse.body).toMatchObject({ count: 8, pages: 5 });
        await esClient.indices.refresh({ index: UPDATES_INDEX });

        const logExtractionResponse = await apiClient.post(
          ENTITY_STORE_ROUTES.internal.FORCE_LOG_EXTRACTION('host'),
          {
            headers: internalHeaders,
            responseType: 'json',
            body: {
              fromDateISO: TO_DATE,
              toDateISO: MAX_DATE_OF_UPDATES,
            },
          }
        );
        expect(logExtractionResponse.statusCode).toBe(200);
        expect(logExtractionResponse.body.success).toBe(true);

        await esClient.indices.refresh({ index: LATEST_ALIAS });

        const latestSearchResponse = await esClient.search({
          index: LATEST_ALIAS,
          size: 100,
          query: {
            bool: {
              filter: [
                { term: { 'entity.EngineMetadata.Type': 'host' } },
                {
                  terms: {
                    'entity.id': [
                      'host:pagination-host-1',
                      'host:pagination-host-2',
                      'host:pagination-host-3',
                      'host:pagination-host-4',
                      'host:pagination-host-5',
                      'host:pagination-host-6',
                    ],
                  },
                },
              ],
            },
          },
        });

        expect(latestSearchResponse.hits.hits).toHaveLength(6);
        const entityIds = latestSearchResponse.hits.hits.map((h) =>
          get(h._source, ['entity', 'id'])
        );
        expect(entityIds.sort()).toStrictEqual([
          'host:pagination-host-1',
          'host:pagination-host-2',
          'host:pagination-host-3',
          'host:pagination-host-4',
          'host:pagination-host-5',
          'host:pagination-host-6',
        ]);
      }
    );

    apiTest(
      'Should succeed when a data stream used as remote index pattern has a closed backing index',
      async ({ apiClient, esClient }) => {
        const DATA_STREAM = 'logs-ccs-closed-smoke';
        const FROM = '2026-06-24T09:59:00Z';
        const TO = '2026-06-24T11:00:00Z';
        const TS = '2026-06-24T10:00:00Z';

        try {
          await esClient.indices.putIndexTemplate({
            name: 'logs-ccs-closed-smoke-template',
            index_patterns: [`${DATA_STREAM}*`],
            data_stream: {},
            priority: 500,
          });

          // First ingest creates the data stream and its first (soon-to-be-closed) backing index.
          await ingestDoc(esClient, DATA_STREAM, {
            '@timestamp': TS,
            host: { name: 'ccs-closed-host' },
          });

          // Discover the first backing index name before rolling over.
          const beforeRollover = await esClient.indices.resolveIndex({
            name: DATA_STREAM,
            expand_wildcards: ['open', 'closed', 'hidden'] as Array<'open' | 'closed' | 'hidden'>,
          });
          const firstBacking = ([] as string[]).concat(
            beforeRollover.data_streams[0]?.backing_indices ?? []
          )[0];

          // Roll over to create a second (open) backing index.
          await esClient.indices.rollover({ alias: DATA_STREAM });

          // The entity we will assert on lands in the new open backing index.
          await ingestDoc(esClient, DATA_STREAM, {
            '@timestamp': TS,
            host: { name: 'ccs-open-host' },
          });

          // Simulate the production scenario: close the older backing index.
          await esClient.indices.close({ index: firstBacking });

          // Remote extraction with the data stream name as the index pattern must not throw
          // cluster_block_exception. Only the entity in the open backing index is extracted.
          const extractResponse = await apiClient.post(
            ENTITY_STORE_ROUTES.internal.FORCE_REMOTE_EXTRACT_TO_UPDATES('host'),
            {
              headers: internalHeaders,
              responseType: 'json',
              body: {
                indexPatterns: [DATA_STREAM],
                fromDateISO: FROM,
                toDateISO: TO,
                docsLimit: DOCS_LIMIT,
              },
            }
          );
          expect(extractResponse.statusCode).toBe(200);
          expect(extractResponse.body).toMatchObject({ count: 1, pages: 1 });
        } finally {
          // Re-open closed backing indices before deleting the data stream.
          const resolved = await esClient.indices.resolveIndex({
            name: DATA_STREAM,
            expand_wildcards: ['open', 'closed', 'hidden'] as Array<'open' | 'closed' | 'hidden'>,
          });
          if (resolved.data_streams.length > 0) {
            const allBacking = resolved.data_streams.flatMap((ds) =>
              ([] as string[]).concat(ds.backing_indices)
            );
            await esClient.indices.open({ index: allBacking, ignore_unavailable: true });
          }
          await esClient.indices.deleteDataStream({ name: DATA_STREAM }, { ignore: [404] });
          await esClient.indices.deleteIndexTemplate(
            { name: 'logs-ccs-closed-smoke-template' },
            { ignore: [404] }
          );
        }
      }
    );
  }
);
