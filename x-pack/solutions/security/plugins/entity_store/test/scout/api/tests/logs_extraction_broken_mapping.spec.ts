/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/api';
import type { EsClient } from '@kbn/scout-security';
import { FF_ENABLE_ENTITY_STORE_V2 } from '../../../../common';
import {
  ENTITY_CONFIDENCE,
  USER_ENTITY_NAMESPACE,
} from '../../../../common/domain/definitions/user_entity_constants';
import {
  ENTITY_STORE_ROUTES,
  ENTITY_STORE_TAGS,
  INTERNAL_HEADERS,
  LATEST_ALIAS,
  PUBLIC_HEADERS,
} from '../fixtures/constants';
import { clearEntityStoreIndices } from '../fixtures/helpers';

const BROKEN_MAPPING_DATA_STREAM = 'logs-broken-mapping';
const BROKEN_MAPPING_TEMPLATE = 'logs-broken-mapping-template';
const FROM_DATE = '2026-04-14T10:00:00Z';
const TO_DATE = '2026-04-14T10:06:00Z';

const DATE_NANOS_DATA_STREAM = 'entity-store-nanos-host-test';
const DATE_NANOS_TEMPLATE = 'entity-store-nanos-host-test-template';
const DATE_NANOS_FROM = '2026-05-01T00:00:00Z';
const DATE_NANOS_TO = '2026-05-01T01:00:00Z';

/** Full expected `_source` for each host entity in the latest index (broken mapping → normalized types). */
const EXPECTED_HOST_LATEST_SOURCES = [
  {
    '@timestamp': '2026-04-14T10:01:00.000Z',
    entity: {
      id: 'host:broken-host-1',
      name: 'broken-host-name-1',
      type: 'Host',
      EngineMetadata: { Type: 'host', UntypedId: 'broken-host-1' },
      attributes: { managed: true },
      lifecycle: { last_activity: '2026-04-14T10:01:00.000Z' },
    },
    host: {
      id: 'broken-host-1',
      name: 'broken-host-name-1',
      ip: '192.168.0.1',
      uptime: 100,
    },
  },
  {
    '@timestamp': '2026-04-14T10:05:00.000Z',
    entity: {
      id: 'host:broken-host-2',
      name: 'broken-host-name-2',
      type: 'Host',
      EngineMetadata: { Type: 'host', UntypedId: 'broken-host-2' },
      attributes: { managed: false },
      lifecycle: { last_activity: '2026-04-14T10:05:00.000Z' },
    },
    host: {
      id: 'broken-host-2',
      name: 'broken-host-name-2',
      ip: '192.168.0.2',
      uptime: 200,
    },
  },
] as const;

/**
 * Full expected `_source` for each user entity (IDP + local). IDP path: arrays on collected ECS fields.
 * Local path: `user:{name}@{host.id}@local`.
 */
const EXPECTED_USER_LATEST_SOURCES = [
  {
    // user.id is long in source — TO_STRING converts 1001 → "1001" for the EUID and stored value
    '@timestamp': '2026-04-14T10:02:00.000Z',
    entity: {
      id: 'user:1001@okta',
      name: 'Broken Idp Name',
      type: 'Identity',
      namespace: 'okta',
      confidence: ENTITY_CONFIDENCE.High,
      EngineMetadata: { Type: 'user' },
    },
    user: {
      id: '1001',
      name: 'Broken Idp Name',
    },
    event: {
      kind: 'asset',
      module: 'okta',
    },
  },
  {
    '@timestamp': '2026-04-14T10:04:00.000Z',
    entity: {
      id: 'user:broken-local-user@broken-user-host-1@local',
      name: 'broken-local-user@broken-ws-99',
      type: 'Identity',
      namespace: USER_ENTITY_NAMESPACE.Local,
      confidence: ENTITY_CONFIDENCE.Medium,
      EngineMetadata: { Type: 'user' },
    },
    user: {
      name: 'broken-local-user',
    },
    host: {
      id: 'broken-user-host-1',
      name: 'broken-ws-99',
    },
    event: {
      kind: 'event',
      category: 'network',
      outcome: 'success',
    },
  },
] as const;

/**
 * Full expected `_source` for the service entity. service.name is long in source —
 * TO_STRING (via castField) converts 99999 → "99999" for the EUID and stored value.
 */
const EXPECTED_SERVICE_LATEST_SOURCES = [
  {
    '@timestamp': '2026-04-14T10:03:00.000Z',
    entity: {
      id: 'service:99999',
      name: '99999',
      type: 'Service',
      EngineMetadata: { Type: 'service', UntypedId: '99999' },
    },
    service: { name: '99999' },
  },
] as const;

const matchExpectedLatestSources = <T extends { entity: { id: string } }>(
  hits: ReadonlyArray<{ _source?: unknown }>,
  expectedDocuments: readonly T[]
): void => {
  expect(hits).toHaveLength(expectedDocuments.length);

  const sourcesByEntityId = new Map<string, unknown>();
  for (const hit of hits) {
    const source = hit._source;
    expect(source).toBeDefined();
    const entityId = (source as { entity: { id: string } }).entity.id;
    sourcesByEntityId.set(entityId, source);
  }

  for (const expected of expectedDocuments) {
    const entityId = expected.entity.id;
    const actual = sourcesByEntityId.get(entityId);
    expect(actual, `missing latest document for ${entityId}`).toBeDefined();
    expect(actual).toMatchObject(expected);
  }
};

const createBrokenMappingTemplate = async (esClient: EsClient) => {
  await esClient.indices.putIndexTemplate({
    name: BROKEN_MAPPING_TEMPLATE,
    index_patterns: [`${BROKEN_MAPPING_DATA_STREAM}*`],
    data_stream: {},
    template: {
      mappings: {
        properties: {
          '@timestamp': { type: 'date' },
          host: {
            properties: {
              id: { type: 'keyword' },
              name: { type: 'text' }, // expected as keyword in entity definition
              ip: { type: 'keyword' }, // expected as ip in entity definition
              uptime: { type: 'text' }, // expected as long in entity definition
              entity: {
                properties: {
                  attributes: {
                    properties: {
                      managed: { type: 'keyword' }, // expected as boolean
                    },
                  },
                  lifecycle: {
                    properties: {
                      last_activity: { type: 'text' }, // expected as date
                    },
                  },
                },
              },
            },
          },
          // User identity + IDP / documentsFilter / namespace evaluation (normally keyword-heavy ECS)
          user: {
            properties: {
              id: { type: 'long' }, // expected as keyword in entity definition; tests long → string coercion via TO_STRING
              name: { type: 'text' },
              email: { type: 'text' },
              domain: { type: 'text' },
            },
          },
          event: {
            properties: {
              kind: { type: 'text' },
              category: { type: 'text' },
              type: { type: 'text' },
              outcome: { type: 'text' },
              module: { type: 'text' },
              dataset: { type: 'text' }, // used in entity.source field evaluation; tests text mapping in SPLIT/MV_FIRST path
            },
          },
          // Service identity field; tests long → string coercion via castField (TO_STRING)
          service: {
            properties: {
              name: { type: 'long' }, // expected as keyword in entity definition
            },
          },
          data_stream: {
            properties: {
              dataset: { type: 'text' },
            },
          },
        },
      },
    },
  });
};

const ingestBrokenHostDocs = async (esClient: EsClient) => {
  const bulkResponse = await esClient.bulk({
    refresh: 'wait_for',
    operations: [
      { create: { _index: BROKEN_MAPPING_DATA_STREAM } },
      {
        '@timestamp': '2026-04-14T10:01:00Z',
        host: {
          id: 'broken-host-1',
          name: 'broken-host-name-1',
          ip: '192.168.0.1',
          uptime: '100',
          entity: {
            attributes: {
              managed: 'true',
            },
            lifecycle: {
              last_activity: '2026-04-14T10:01:00Z',
            },
          },
        },
      },
      { create: { _index: BROKEN_MAPPING_DATA_STREAM } },
      {
        '@timestamp': '2026-04-14T10:05:00Z',
        host: {
          id: 'broken-host-2',
          name: 'broken-host-name-2',
          ip: '192.168.0.2',
          uptime: '200',
          entity: {
            attributes: {
              managed: '0',
            },
            lifecycle: {
              last_activity: '2026-04-14T10:05:00Z',
            },
          },
        },
      },
    ],
  });

  expect(bulkResponse.errors).toBe(false);
};

const ingestBrokenUserDocs = async (esClient: EsClient) => {
  const bulkResponse = await esClient.bulk({
    refresh: 'wait_for',
    operations: [
      { create: { _index: BROKEN_MAPPING_DATA_STREAM } },
      {
        // user.id is long (not keyword) — entity store must TO_STRING it for the EUID
        // event.dataset is text — exercises the SPLIT/MV_FIRST text path in entity.source evaluation
        '@timestamp': '2026-04-14T10:02:00Z',
        event: { kind: 'asset', module: 'okta', dataset: 'okta.users' },
        user: { id: 1001, name: 'Broken Idp Name' },
      },
      { create: { _index: BROKEN_MAPPING_DATA_STREAM } },
      {
        // event.dataset as text — exercises entity.source evaluation on the local identity path
        '@timestamp': '2026-04-14T10:04:00Z',
        event: {
          kind: 'event',
          category: 'network',
          outcome: 'success',
          dataset: 'endpoint.events.network',
        },
        user: { name: 'broken-local-user' },
        host: { id: 'broken-user-host-1', name: 'broken-ws-99' },
      },
    ],
  });

  expect(bulkResponse.errors).toBe(false);
};

/**
 * Remove the test data stream (and its backing indices) and the composable template.
 */
const cleanupBrokenMappingArtifacts = async (esClient: EsClient) => {
  await esClient.indices.deleteDataStream({ name: BROKEN_MAPPING_DATA_STREAM }, { ignore: [404] });
  await esClient.indices.deleteIndexTemplate({ name: BROKEN_MAPPING_TEMPLATE }, { ignore: [404] });
};

const createDateNanosTemplate = async (esClient: EsClient) => {
  await esClient.indices.putIndexTemplate({
    name: DATE_NANOS_TEMPLATE,
    index_patterns: [`${DATE_NANOS_DATA_STREAM}*`],
    data_stream: {},
    template: {
      mappings: {
        properties: {
          '@timestamp': { type: 'date_nanos' },
          host: {
            properties: {
              id: { type: 'keyword' },
              name: { type: 'keyword' },
            },
          },
        },
      },
    },
  });
};

const cleanupDateNanosArtifacts = async (esClient: EsClient) => {
  await esClient.indices.deleteDataStream({ name: DATE_NANOS_DATA_STREAM }, { ignore: [404] });
  await esClient.indices.deleteIndexTemplate({ name: DATE_NANOS_TEMPLATE }, { ignore: [404] });
};

const ingestBrokenServiceDoc = async (esClient: EsClient) => {
  const bulkResponse = await esClient.bulk({
    refresh: 'wait_for',
    operations: [
      { create: { _index: BROKEN_MAPPING_DATA_STREAM } },
      {
        '@timestamp': '2026-04-14T10:03:00Z',
        service: { name: 99999 },
      },
    ],
  });
  expect(bulkResponse.errors).toBe(false);
};

apiTest.describe('Entity Store logs extraction broken mapping', { tag: ENTITY_STORE_TAGS }, () => {
  let defaultHeaders: Record<string, string>;
  let internalHeaders: Record<string, string>;

  apiTest.beforeAll(async ({ samlAuth, apiClient, kbnClient, esClient }) => {
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

    const installResponse = await apiClient.post(ENTITY_STORE_ROUTES.public.INSTALL, {
      headers: defaultHeaders,
      responseType: 'json',
      body: {},
    });
    expect(installResponse.statusCode).toBe(201);

    await cleanupBrokenMappingArtifacts(esClient);
    await createBrokenMappingTemplate(esClient);
    await esClient.indices.createDataStream(
      { name: BROKEN_MAPPING_DATA_STREAM },
      { ignore: [400] }
    );
  });

  apiTest.afterAll(async ({ apiClient, esClient }) => {
    await cleanupBrokenMappingArtifacts(esClient);

    const uninstallResponse = await apiClient.post(ENTITY_STORE_ROUTES.public.UNINSTALL, {
      headers: defaultHeaders,
      responseType: 'json',
      body: {},
    });
    expect(uninstallResponse.statusCode).toBe(200);

    await clearEntityStoreIndices(esClient);
  });

  apiTest(
    'should extract hosts successfully when source index has conflicting field mappings',
    async ({ apiClient, esClient }) => {
      await ingestBrokenHostDocs(esClient);

      const extractionResponse = await apiClient.post(
        ENTITY_STORE_ROUTES.internal.FORCE_LOG_EXTRACTION('host'),
        {
          headers: internalHeaders,
          responseType: 'json',
          body: {
            fromDateISO: FROM_DATE,
            toDateISO: TO_DATE,
          },
        }
      );

      expect(extractionResponse.statusCode).toBe(200);
      expect(extractionResponse.body).toMatchObject({
        success: true,
        count: 2,
        pages: 1,
      });

      await esClient.indices.refresh({ index: LATEST_ALIAS });
      const bothHosts = await esClient.search({
        index: LATEST_ALIAS,
        size: 10,
        query: {
          bool: {
            filter: [
              { term: { 'entity.EngineMetadata.Type': 'host' } },
              {
                terms: {
                  'entity.id': ['host:broken-host-1', 'host:broken-host-2'],
                },
              },
            ],
          },
        },
      });
      matchExpectedLatestSources(bothHosts.hits.hits, EXPECTED_HOST_LATEST_SOURCES);
    }
  );

  apiTest(
    'should collect new field values on subsequent extractions when entity already exists and field has multi-field sub-fields',
    async ({ apiClient, esClient }) => {
      const t0 = new Date('2026-04-14T10:10:00.000Z');
      const sec = (n: number) => new Date(t0.getTime() + n * 1000).toISOString();

      // First doc: entity doesn't exist yet — first extraction creates it with no LOOKUP JOIN.
      await esClient.bulk({
        refresh: 'wait_for',
        operations: [
          { create: { _index: BROKEN_MAPPING_DATA_STREAM } },
          {
            '@timestamp': sec(1),
            event: { kind: 'asset', module: 'okta' },
            user: {
              id: 2001, // long; entity id = user:2001@okta
              name: 'multifield-test-user',
              full_name: 'First Full Name',
            },
          },
        ],
      });

      const firstExtraction = await apiClient.post(
        ENTITY_STORE_ROUTES.internal.FORCE_LOG_EXTRACTION('user'),
        {
          headers: internalHeaders,
          responseType: 'json',
          body: { fromDateISO: t0.toISOString(), toDateISO: sec(15) }, // covers doc1 only (sec(30) is outside)
        }
      );
      expect(firstExtraction.statusCode).toBe(200);
      expect(firstExtraction.body).toMatchObject({ success: true, count: 1 });

      await esClient.indices.refresh({ index: LATEST_ALIAS });
      expect(
        (
          await esClient.search({
            index: LATEST_ALIAS,
            query: { term: { 'entity.id': 'user:2001@okta' } },
          })
        ).hits.hits
      ).toHaveLength(1);

      // Second doc: same user, different full_name. Entity now exists in LATEST, so the second
      // extraction does a LOOKUP JOIN — which surfaces user.full_name.text as an extra column.
      // Writing it back causes a mapping conflict (object vs keyword) and silently drops the update.
      await esClient.bulk({
        refresh: 'wait_for',
        operations: [
          { create: { _index: BROKEN_MAPPING_DATA_STREAM } },
          {
            '@timestamp': sec(30),
            event: { kind: 'asset', module: 'okta' },
            user: {
              id: 2001, // long; same entity as first doc
              name: 'multifield-test-user',
              full_name: 'Second Full Name',
            },
          },
        ],
      });

      const secondExtraction = await apiClient.post(
        ENTITY_STORE_ROUTES.internal.FORCE_LOG_EXTRACTION('user'),
        {
          headers: internalHeaders,
          responseType: 'json',
          body: { fromDateISO: t0.toISOString(), toDateISO: sec(59) }, // covers both docs
        }
      );
      expect(secondExtraction.statusCode).toBe(200);
      expect(secondExtraction.body).toMatchObject({ success: true, count: 1 });

      await esClient.indices.refresh({ index: LATEST_ALIAS });
      const afterSecond = await esClient.search({
        index: LATEST_ALIAS,
        query: { term: { 'entity.id': 'user:2001@okta' } },
      });
      expect(afterSecond.hits.hits).toHaveLength(1);

      // user.full_name uses `collect` (VALUES) — both values must be present if the update landed.
      const source = afterSecond.hits.hits[0]._source as { user: { full_name: unknown } };
      expect(source.user.full_name).toContain('First Full Name');
      expect(source.user.full_name).toContain('Second Full Name');
    }
  );

  apiTest(
    'should extract users successfully when source index has conflicting field mappings (IDP + local id / filters)',
    async ({ apiClient, esClient }) => {
      await ingestBrokenUserDocs(esClient);

      const extractionResponse = await apiClient.post(
        ENTITY_STORE_ROUTES.internal.FORCE_LOG_EXTRACTION('user'),
        {
          headers: internalHeaders,
          responseType: 'json',
          body: {
            fromDateISO: FROM_DATE,
            toDateISO: TO_DATE,
          },
        }
      );

      expect(extractionResponse.statusCode).toBe(200);
      expect(extractionResponse.body).toMatchObject({
        success: true,
        count: 2,
        pages: 1,
      });

      await esClient.indices.refresh({ index: LATEST_ALIAS });
      const bothUsers = await esClient.search({
        index: LATEST_ALIAS,
        size: 10,
        query: {
          bool: {
            filter: [
              { term: { 'entity.EngineMetadata.Type': 'user' } },
              {
                terms: {
                  'entity.id': [
                    'user:1001@okta',
                    'user:broken-local-user@broken-user-host-1@local',
                  ],
                },
              },
            ],
          },
        },
      });
      matchExpectedLatestSources(bothUsers.hits.hits, EXPECTED_USER_LATEST_SOURCES);
    }
  );

  apiTest(
    'should extract hosts successfully when timestamp is date_nanos (lifecycle COALESCE datetime/date_nanos type fix)',
    async ({ apiClient, esClient }) => {
      await cleanupDateNanosArtifacts(esClient);
      await createDateNanosTemplate(esClient);
      await esClient.indices.createDataStream({ name: DATE_NANOS_DATA_STREAM }, { ignore: [400] });

      const DOC_TIMESTAMP_1 = '2026-05-01T00:10:00.000Z';
      const DOC_TIMESTAMP_2 = '2026-05-01T00:20:00.000Z';

      await esClient.bulk({
        refresh: 'wait_for',
        operations: [
          { create: { _index: DATE_NANOS_DATA_STREAM } },
          {
            '@timestamp': DOC_TIMESTAMP_1,
            host: { id: 'nanos-host-1', name: 'nanos-host-name-1' },
          },
          { create: { _index: DATE_NANOS_DATA_STREAM } },
          {
            '@timestamp': DOC_TIMESTAMP_2,
            host: { id: 'nanos-host-1', name: 'nanos-host-name-1' },
          },
        ],
      });

      // Include the date_nanos stream as an additional source. It does not carry a logs-* prefix
      // so it is not picked up by the default pattern — it must be added explicitly.
      await apiClient.put(ENTITY_STORE_ROUTES.public.UPDATE, {
        headers: defaultHeaders,
        responseType: 'json',
        body: {
          logExtraction: {
            additionalIndexPatterns: [DATE_NANOS_DATA_STREAM],
          },
        },
      });

      try {
        // First extraction: entity not yet in latest. COALESCE is type-checked at planning time —
        // without the fix this fails with a verification_exception regardless of JOIN matches.
        const firstExtraction = await apiClient.post(
          ENTITY_STORE_ROUTES.internal.FORCE_LOG_EXTRACTION('host'),
          {
            headers: internalHeaders,
            responseType: 'json',
            body: { fromDateISO: DATE_NANOS_FROM, toDateISO: DATE_NANOS_TO },
          }
        );

        expect(firstExtraction.statusCode).toBe(200);
        expect(firstExtraction.body).toMatchObject({ success: true, count: 1 });

        await esClient.indices.refresh({ index: LATEST_ALIAS });
        const after1st = await esClient.search({
          index: LATEST_ALIAS,
          query: { term: { 'entity.id': 'host:nanos-host-1' } },
        });
        expect(after1st.hits.hits).toHaveLength(1);

        const source1 = after1st.hits.hits[0]._source as {
          entity: { lifecycle: { first_seen?: string; last_seen?: string } };
        };
        expect(source1.entity.lifecycle.first_seen).toBe(DOC_TIMESTAMP_1);
        expect(source1.entity.lifecycle.last_seen).toBe(DOC_TIMESTAMP_2);

        // Second extraction: entity now exists in latest — COALESCE merges both sides.
        const thirdTimestamp = '2026-05-01T00:30:00.000Z';
        await esClient.bulk({
          refresh: 'wait_for',
          operations: [
            { create: { _index: DATE_NANOS_DATA_STREAM } },
            {
              '@timestamp': thirdTimestamp,
              host: { id: 'nanos-host-1', name: 'nanos-host-name-1' },
            },
          ],
        });

        const secondExtraction = await apiClient.post(
          ENTITY_STORE_ROUTES.internal.FORCE_LOG_EXTRACTION('host'),
          {
            headers: internalHeaders,
            responseType: 'json',
            body: { fromDateISO: DATE_NANOS_FROM, toDateISO: DATE_NANOS_TO },
          }
        );

        expect(secondExtraction.statusCode).toBe(200);
        expect(secondExtraction.body).toMatchObject({ success: true, count: 1 });

        await esClient.indices.refresh({ index: LATEST_ALIAS });
        const after2nd = await esClient.search({
          index: LATEST_ALIAS,
          query: { term: { 'entity.id': 'host:nanos-host-1' } },
        });
        expect(after2nd.hits.hits).toHaveLength(1);

        const source2 = after2nd.hits.hits[0]._source as {
          entity: { lifecycle: { first_seen?: string; last_seen?: string } };
        };
        // prefer_oldest_value → first_seen must stay pinned at the earliest timestamp
        expect(source2.entity.lifecycle.first_seen).toBe(DOC_TIMESTAMP_1);
        // prefer_newest_value → last_seen must advance to the newest timestamp
        expect(source2.entity.lifecycle.last_seen).toBe(thirdTimestamp);
      } finally {
        // Restore config and clean up regardless of test outcome
        await apiClient.put(ENTITY_STORE_ROUTES.public.UPDATE, {
          headers: defaultHeaders,
          responseType: 'json',
          body: { logExtraction: { additionalIndexPatterns: [] } },
        });
        await cleanupDateNanosArtifacts(esClient);
      }
    }
  );

  apiTest(
    'should extract service successfully when service.name is mapped as long (triggers castField ambiguity fix)',
    async ({ apiClient, esClient }) => {
      await ingestBrokenServiceDoc(esClient);

      const extractionResponse = await apiClient.post(
        ENTITY_STORE_ROUTES.internal.FORCE_LOG_EXTRACTION('service'),
        {
          headers: internalHeaders,
          responseType: 'json',
          body: {
            fromDateISO: FROM_DATE,
            toDateISO: TO_DATE,
          },
        }
      );

      expect(extractionResponse.statusCode).toBe(200);
      expect(extractionResponse.body).toMatchObject({
        success: true,
        count: 1,
        pages: 1,
      });

      await esClient.indices.refresh({ index: LATEST_ALIAS });
      const serviceEntities = await esClient.search({
        index: LATEST_ALIAS,
        size: 10,
        query: {
          bool: {
            filter: [
              { term: { 'entity.EngineMetadata.Type': 'service' } },
              {
                terms: {
                  'entity.id': ['service:99999'],
                },
              },
            ],
          },
        },
      });
      matchExpectedLatestSources(serviceEntities.hits.hits, EXPECTED_SERVICE_LATEST_SOURCES);
    }
  );
});
