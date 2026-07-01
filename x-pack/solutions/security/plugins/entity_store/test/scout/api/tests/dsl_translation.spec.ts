/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-security/api';
import { apiTest } from '@kbn/scout-security';
import {
  PUBLIC_HEADERS,
  ENTITY_STORE_ROUTES,
  ENTITY_STORE_TAGS,
  UPDATES_INDEX,
} from '../fixtures/constants';
import { FF_ENABLE_ENTITY_STORE_V2 } from '../../../../common';
import { clearEntityStoreIndices, ingestDoc } from '../fixtures/helpers';
import {
  getEuidDslFilterBasedOnDocument,
  getEuidDslDocumentsContainsIdFilter,
} from '../../../../common/domain/euid/dsl';
import { getEuidFromObject } from '../../../../common/domain/euid/memory';
import { deriveUserEntityPreAggMetadata } from '../fixtures/user_entity_pre_agg_metadata';
import {
  USER_SCOUT_INVALID_PER_DOCUMENT_FILTER_EXAMPLES,
  USER_TS_ARCHIVE_EXPECTED_CONTAINS_ID_COUNT,
  USER_TS_EXTRACTION_CASES,
} from '../fixtures/user_ts_extraction_cases';

/** Archive-backed user.ts scenarios only (excludes ingested-only rows). */
const USER_TS_ARCHIVE_SCENARIOS = USER_TS_EXTRACTION_CASES.filter((c) => !c.ingestSource);

/** Scenarios that yield a defined EUID in the static archive (for strict containsId subset checks). */
const USER_TS_ARCHIVE_SCENARIOS_WITH_EUID = USER_TS_ARCHIVE_SCENARIOS.filter(
  (c) => c.expectedEuid !== undefined
);

function getTotal(hits: { total?: number | { value: number } }): number {
  const total = hits.total;
  if (total === undefined) return 0;
  return typeof total === 'number' ? total : total.value;
}

async function searchWithFilter(
  esClient: { search: (params: object) => Promise<unknown> },
  query: object | undefined,
  size = 100
) {
  return esClient.search({
    index: UPDATES_INDEX,
    query: query ? { ...query } : {},
    size,
  }) as Promise<{
    hits: { hits: Array<{ _source?: unknown }>; total?: number | { value: number } };
  }>;
}

interface DocSource {
  user?: { name?: string; email?: string; id?: string };
  host?: { id?: string; name?: string; entity?: { id?: string } };
  entity?: { id?: string };
  service?: { name?: string; entity?: { id?: string } };
}

function getDocSource(hit: { _source?: unknown }): DocSource | undefined {
  return hit._source as DocSource | undefined;
}

function hasDocWith(
  hits: Array<{ _source?: unknown }>,
  predicate: (src: DocSource) => boolean
): boolean {
  return hits.some((h) => predicate(getDocSource(h) ?? {}));
}

apiTest.describe('DSL query translation', { tag: ENTITY_STORE_TAGS }, () => {
  let defaultHeaders: Record<string, string>;

  apiTest.beforeAll(async ({ samlAuth, apiClient, esArchiver, kbnClient }) => {
    const credentials = await samlAuth.asInteractiveUser('admin');
    defaultHeaders = {
      ...credentials.cookieHeader,
      ...PUBLIC_HEADERS,
    };

    await kbnClient.uiSettings.update({
      [FF_ENABLE_ENTITY_STORE_V2]: true,
    });

    const response = await apiClient.post(ENTITY_STORE_ROUTES.public.INSTALL, {
      headers: defaultHeaders,
      responseType: 'json',
      body: {},
    });
    expect(response.statusCode).toBe(201);

    await esArchiver.loadIfNeeded(
      'x-pack/solutions/security/plugins/entity_store/test/scout/api/es_archives/updates'
    );
  });

  apiTest.afterAll(async ({ apiClient, esClient }) => {
    const response = await apiClient.post(ENTITY_STORE_ROUTES.public.UNINSTALL, {
      headers: defaultHeaders,
      responseType: 'json',
      body: {},
    });
    expect(response.statusCode).toBe(200);
    await clearEntityStoreIndices(esClient);
  });

  apiTest(
    'should return exactly the document when generic DSL is built from entity.id',
    async ({ esClient }) => {
      const docSource = { entity: { id: 'generic-id' } };
      const dsl = getEuidDslFilterBasedOnDocument('generic', docSource);
      expect(dsl).toBeDefined();

      const result = await searchWithFilter(esClient, dsl, 10);

      expect(getTotal(result.hits)).toBe(1);
      expect(result.hits.hits).toHaveLength(1);
      expect(result.hits.hits[0]._source).toMatchObject({ entity: { id: 'generic-id' } });
    }
  );

  apiTest(
    'should return the expected documents when host DSL is built from host.name and host.domain',
    async ({ esClient }) => {
      const docSource = { host: { name: 'server-01', domain: 'example.com' } };
      const dsl = getEuidDslFilterBasedOnDocument('host', docSource);
      expect(dsl).toBeDefined();

      const result = await searchWithFilter(esClient, dsl, 10);

      expect(getTotal(result.hits)).toBe(3);
      expect(hasDocWith(result.hits.hits, (s) => s.host?.name === 'server-01')).toBe(true);
    }
  );

  apiTest(
    'should return the expected document when host DSL is built from host.name only',
    async ({ esClient }) => {
      const dsl = getEuidDslFilterBasedOnDocument('host', { host: { name: 'desktop-02' } });
      expect(dsl).toBeDefined();

      const result = await searchWithFilter(esClient, dsl, 10);

      expect(getTotal(result.hits)).toBe(1);
      expect(result.hits.hits[0]._source).toMatchObject({ host: { name: 'desktop-02' } });
    }
  );

  const userTsNoPerDocumentDslScenarios = USER_TS_ARCHIVE_SCENARIOS.filter(
    (s) => s.expectNoPerDocumentDsl
  );

  apiTest(
    'user.ts DSL: should return undefined when dslFilterSource fails documentsFilter or postAgg gate',
    async ({ esClient }) => {
      await searchWithFilter(esClient, { match_all: {} }, 1);
      for (const scenario of userTsNoPerDocumentDslScenarios) {
        expect(getEuidDslFilterBasedOnDocument('user', scenario.dslFilterSource)).toBeUndefined();
      }
    }
  );

  apiTest(
    'user: synthetic invalid docs should not return per-document DSL (documentsFilter or postAgg gate)',
    async ({ esClient }) => {
      await searchWithFilter(esClient, { match_all: {} }, 1);
      for (const example of USER_SCOUT_INVALID_PER_DOCUMENT_FILTER_EXAMPLES) {
        expect(getEuidDslFilterBasedOnDocument('user', example.doc)).toBeUndefined();
      }
    }
  );

  for (const scenario of USER_TS_ARCHIVE_SCENARIOS) {
    if (scenario.expectNoPerDocumentDsl) {
      continue;
    }

    apiTest(
      `user.ts DSL: should return a single matching hit for scenario "${scenario.id}"`,
      async ({ esClient }) => {
        const dsl = getEuidDslFilterBasedOnDocument('user', scenario.dslFilterSource);
        expect(dsl).toBeDefined();

        const result = await searchWithFilter(esClient, dsl, 10);

        expect(getTotal(result.hits)).toBe(1);
        expect(result.hits.hits).toHaveLength(1);
        expect(result.hits.hits[0]._source).toMatchObject(scenario.dslFilterSource);
        expect(getEuidFromObject('user', result.hits.hits[0])).toBe(scenario.expectedEuid);

        expect(scenario.expectedMeta).toBeDefined();
        const expectedMeta = scenario.expectedMeta!;
        expect(deriveUserEntityPreAggMetadata(result.hits.hits[0])).toStrictEqual({
          namespace: expectedMeta.namespace,
          confidence: expectedMeta.confidence,
          entityName: expectedMeta.entityName,
        });
      }
    );
  }

  const userTsAssetCloudIngestedScenarios = USER_TS_EXTRACTION_CASES.filter(
    (c) =>
      c.id.startsWith('asset-cloud-provider-') &&
      c.ingestSource !== undefined &&
      c.expectedEuid !== undefined &&
      !c.expectNoPerDocumentDsl
  );

  for (const scenario of userTsAssetCloudIngestedScenarios) {
    apiTest(
      `user.ts DSL (ingested asset + cloud.provider): single hit for scenario "${scenario.id}"`,
      async ({ esClient }) => {
        await ingestDoc(esClient, scenario.ingestSource!);
        const dsl = getEuidDslFilterBasedOnDocument('user', scenario.dslFilterSource);
        expect(dsl).toBeDefined();

        const result = await searchWithFilter(esClient, dsl, 10);

        expect(getTotal(result.hits)).toBe(1);
        expect(result.hits.hits).toHaveLength(1);
        expect(result.hits.hits[0]._source).toMatchObject(scenario.dslFilterSource);
        expect(getEuidFromObject('user', result.hits.hits[0])).toBe(scenario.expectedEuid);

        expect(scenario.expectedMeta).toBeDefined();
        const expectedMeta = scenario.expectedMeta!;
        expect(deriveUserEntityPreAggMetadata(result.hits.hits[0])).toStrictEqual({
          namespace: expectedMeta.namespace,
          confidence: expectedMeta.confidence,
          entityName: expectedMeta.entityName,
        });
      }
    );
  }

  apiTest(
    'should return exactly the mailchimp document when service DSL is built from service.name',
    async ({ esClient }) => {
      const dsl = getEuidDslFilterBasedOnDocument('service', { service: { name: 'mailchimp' } });
      expect(dsl).toBeDefined();

      const result = await searchWithFilter(esClient, dsl, 10);

      expect(getTotal(result.hits)).toBe(1);
      expect(result.hits.hits[0]._source).toMatchObject({
        service: { entity: { id: 'mailchimp' } },
      });
    }
  );

  apiTest(
    'should return the service-name document when service DSL is built from service.name',
    async ({ esClient }) => {
      const dsl = getEuidDslFilterBasedOnDocument('service', { service: { name: 'service-name' } });
      expect(dsl).toBeDefined();

      const result = await searchWithFilter(esClient, dsl, 10);

      expect(getTotal(result.hits)).toBe(1);
      expect(result.hits.hits[0]._source).toMatchObject({ service: { name: 'service-name' } });
    }
  );

  apiTest(
    'should return only documents with entity.id for generic containsId filter',
    async ({ esClient }) => {
      const dsl = getEuidDslDocumentsContainsIdFilter('generic');
      const result = await searchWithFilter(esClient, dsl);

      expect(getTotal(result.hits)).toBe(1);
      expect(result.hits.hits).toHaveLength(1);
      expect(result.hits.hits[0]._source).toMatchObject({ entity: { id: 'generic-id' } });
    }
  );

  apiTest(
    'should return documents with service identity fields for service containsId filter',
    async ({ esClient }) => {
      const dsl = getEuidDslDocumentsContainsIdFilter('service');
      const result = await searchWithFilter(esClient, dsl);

      expect(getTotal(result.hits)).toBe(2);
      expect(hasDocWith(result.hits.hits, (s) => s.service?.entity?.id === 'mailchimp')).toBe(true);
      expect(hasDocWith(result.hits.hits, (s) => s.service?.name === 'service-name')).toBe(true);
    }
  );

  apiTest(
    'should enforce exact user containsId hit count and match each archive scenario with a defined EUID',
    async ({ esClient }) => {
      const dsl = getEuidDslDocumentsContainsIdFilter('user');
      const result = await searchWithFilter(esClient, dsl, 100);
      const { hits } = result.hits;

      expect(getTotal(result.hits)).toBe(USER_TS_ARCHIVE_EXPECTED_CONTAINS_ID_COUNT);
      expect(hits).toHaveLength(USER_TS_ARCHIVE_EXPECTED_CONTAINS_ID_COUNT);

      for (const scenario of USER_TS_ARCHIVE_SCENARIOS_WITH_EUID) {
        const subset = hits.filter((h) =>
          docMatchesQuery((getDocSource(h) ?? {}) as Record<string, unknown>, scenario.query)
        );
        expect(subset, `scenario "${scenario.id}"`).toHaveLength(1);
        expect(getEuidFromObject('user', subset[0])).toBe(scenario.expectedEuid);
        expect(scenario.expectedMeta).toBeDefined();
        const expectedMeta = scenario.expectedMeta!;
        expect(deriveUserEntityPreAggMetadata(subset[0])).toStrictEqual({
          namespace: expectedMeta.namespace,
          confidence: expectedMeta.confidence,
          entityName: expectedMeta.entityName,
        });
      }

      expect(hasDocWith(hits, (s) => s.user?.name === 'john.doe')).toBe(true);
      expect(
        hasDocWith(hits, (s) => s.user?.name === 'alice.local' && s.host?.id === 'host-nonidp-001')
      ).toBe(true);

      // All these documents could potentially be a contributor to the EUID, so we should include them.
      expect(hasDocWith(hits, (s) => s.user?.email === 'invalid-idp-illegal@test.com')).toBe(true);
      expect(hasDocWith(hits, (s) => s.user?.name === 'not-captured-no-event')).toBe(true);

      // Outcome failure should never be present
      expect(hasDocWith(hits, (s) => s.user?.name === 'ignored-outcome-failure')).toBe(false);

      const bareOnlyTimestamp = hasDocWith(hits, (s) => {
        const keys = Object.keys(s);
        return keys.length === 1 && keys[0] === '@timestamp';
      });
      expect(bareOnlyTimestamp).toBe(false);
    }
  );

  apiTest(
    'should return documents with any host identity field for host containsId filter',
    async ({ esClient }) => {
      const dsl = getEuidDslDocumentsContainsIdFilter('host');
      const result = await searchWithFilter(esClient, dsl);

      expect(getTotal(result.hits)).toBeGreaterThan(0);
      expect(
        hasDocWith(result.hits.hits, (s) => s.host?.entity?.id === 'host-with-entity-id')
      ).toBe(true);
      expect(hasDocWith(result.hits.hits, (s) => s.host?.id === 'host-123')).toBe(true);
      expect(hasDocWith(result.hits.hits, (s) => s.host?.name === 'desktop-02')).toBe(true);
    }
  );

  apiTest(
    'should not include bare documents with no user identity fields in user containsId results',
    async ({ esClient }) => {
      const dsl = getEuidDslDocumentsContainsIdFilter('user');
      const result = await searchWithFilter(esClient, dsl);

      const bareDocMatched = hasDocWith(result.hits.hits, (s) => {
        const keys = Object.keys(s);
        return !s.user && !s.entity?.id && keys.length <= 1;
      });
      expect(bareDocMatched).toBe(false);
    }
  );
});

// Reads a dotted path (e.g. user.name) on a plain object.
// Returns the leaf value, or undefined if a segment is missing or not traversable (null / non-object).
function getNestedField(obj: Record<string, unknown>, dottedPath: string): unknown {
  const segments = dottedPath.split('.');
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

// True if archived _source matches our fixture query subset: term, bool.must/filter (all clauses), exists.
// Used to find the one hit per scenario locally; unknown shapes return false.
function docMatchesQuery(src: Record<string, unknown>, query: object): boolean {
  if (isTermQuery(query)) {
    return sourceMatchesTermQuery(src, query.term);
  }

  if (isBoolQuery(query)) {
    return sourceMatchesBoolQuery(src, query.bool);
  }

  if (isExistsQuery(query)) {
    return sourceMatchesExistsQuery(src, query.exists);
  }

  return false;
}

function isTermQuery(query: object): query is { term: Record<string, unknown> } {
  return 'term' in query && query.term !== null && typeof query.term === 'object';
}

function sourceMatchesTermQuery(
  src: Record<string, unknown>,
  term: Record<string, unknown>
): boolean {
  const entries = Object.entries(term);
  if (entries.length !== 1) {
    return false;
  }
  const [field, value] = entries[0];
  return getNestedField(src, field) === value;
}

interface BoolQueryBody {
  must?: object[];
  filter?: object[];
}

function isBoolQuery(query: object): query is { bool: BoolQueryBody } {
  return 'bool' in query && query.bool !== null && typeof query.bool === 'object';
}

function sourceMatchesBoolQuery(src: Record<string, unknown>, bool: BoolQueryBody): boolean {
  const clauses = [...(bool.must ?? []), ...(bool.filter ?? [])];
  if (clauses.length === 0) {
    return false;
  }
  return clauses.every((clause) => docMatchesQuery(src, clause));
}

function isExistsQuery(query: object): query is { exists: { field: string } } {
  return 'exists' in query && query.exists !== null && typeof query.exists === 'object';
}

function sourceMatchesExistsQuery(
  src: Record<string, unknown>,
  exists: { field: string }
): boolean {
  const value = getNestedField(src, exists.field);
  return value !== undefined && value !== null && value !== '';
}
